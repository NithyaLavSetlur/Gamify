from datetime import date, datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import BossFight, CalendarEvent, IntegrationToken, Quest
from app.services.gamification import award_xp

STUDY_WORDS = ("study", "uni", "exam", "revision", "assignment", "lecture", "tutorial", "class", "homework", "quiz")
EXAM_WORDS = ("exam", "test", "final", "midterm", "assessment")
ASSIGNMENT_WORDS = ("assignment", "homework", "essay", "report", "project", "submission", "deadline")
PRACTICE_WORDS = ("practice", "questions", "problem set", "past paper", "quiz")
TICKTICK_API = "https://api.ticktick.com/open/v1"
TICKTICK_TOKEN_URL = "https://ticktick.com/oauth/token"
TICKTICK_AUTH_URL = "https://ticktick.com/oauth/authorize"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def detect_study_block(title: str) -> bool:
    lowered = title.lower()
    return any(word in lowered for word in STUDY_WORDS)


def get_token(db: Session, provider: str) -> IntegrationToken | None:
    return db.query(IntegrationToken).filter(IntegrationToken.provider == provider).one_or_none()


def upsert_token(db: Session, provider: str, token_payload: dict) -> IntegrationToken:
    token = get_token(db, provider)
    expires_in = token_payload.get("expires_in")
    expires_at = datetime.now() + timedelta(seconds=int(expires_in) - 60) if expires_in else None
    if not token:
        token = IntegrationToken(provider=provider, access_token="")
        db.add(token)
    token.access_token = token_payload.get("access_token", token.access_token)
    token.refresh_token = token_payload.get("refresh_token") or token.refresh_token
    token.expires_at = expires_at
    token.scope = token_payload.get("scope", token.scope or "")
    token.token_type = token_payload.get("token_type", "Bearer")
    db.commit()
    db.refresh(token)
    return token


def ticktick_status(settings: Settings, connected: bool, has_token: bool = False) -> dict:
    configured = bool(settings.ticktick_client_id and settings.ticktick_client_secret)
    params = urlencode(
        {
            "client_id": settings.ticktick_client_id,
            "redirect_uri": settings.ticktick_redirect_uri,
            "response_type": "code",
            "scope": "tasks:read tasks:write",
            "state": "local-dev",
        }
    )
    return {
        "provider": "ticktick",
        "configured": configured,
        "connected": bool(connected and configured and has_token),
        "auth_url": f"{TICKTICK_AUTH_URL}?{params}" if configured else None,
        "manual_fallback": not configured or not has_token,
    }


def google_status(settings: Settings, connected: bool, has_token: bool = False) -> dict:
    configured = bool(settings.google_client_id and settings.google_client_secret)
    scope = "https://www.googleapis.com/auth/calendar.events"
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": scope,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": "local-dev",
        }
    )
    return {
        "provider": "google_calendar",
        "configured": configured,
        "connected": bool(connected and configured and has_token),
        "auth_url": f"{GOOGLE_AUTH_URL}?{params}" if configured else None,
        "manual_fallback": not configured or not has_token,
    }


def exchange_ticktick_code(settings: Settings, db: Session, code: str) -> IntegrationToken:
    # TickTick Open API expects the client id/secret as HTTP Basic auth for token exchange.
    response = httpx.post(
        TICKTICK_TOKEN_URL,
        data={
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.ticktick_redirect_uri,
            "scope": "tasks:read tasks:write",
        },
        auth=(settings.ticktick_client_id, settings.ticktick_client_secret),
        timeout=20,
    )
    response.raise_for_status()
    return upsert_token(db, "ticktick", response.json())


def exchange_google_code(settings: Settings, db: Session, code: str) -> IntegrationToken:
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.google_redirect_uri,
        },
        timeout=20,
    )
    response.raise_for_status()
    return upsert_token(db, "google_calendar", response.json())


def google_access_token(settings: Settings, db: Session) -> str | None:
    token = get_token(db, "google_calendar")
    if not token:
        return None
    if token.expires_at and token.expires_at <= datetime.now() and token.refresh_token:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": token.refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=20,
        )
        response.raise_for_status()
        token = upsert_token(db, "google_calendar", response.json())
    return token.access_token


def sync_ticktick_tasks(db: Session) -> dict:
    token = get_token(db, "ticktick")
    if not token:
        return {"synced": False, "mode": "not_connected", "created": 0, "updated": 0, "message": "TickTick is not connected. No mock tasks were created."}

    headers = {"Authorization": f"Bearer {token.access_token}"}
    projects_response = httpx.get(f"{TICKTICK_API}/project", headers=headers, timeout=20)
    projects_response.raise_for_status()
    projects = projects_response.json()
    created = 0
    updated = 0
    completed_awarded = 0
    for project in projects:
        project_id = project.get("id")
        if not project_id:
            continue
        data_response = httpx.get(f"{TICKTICK_API}/project/{project_id}/data", headers=headers, timeout=20)
        data_response.raise_for_status()
        project_data = data_response.json()
        for task in project_data.get("tasks", []):
            external_id = task.get("id")
            if not external_id:
                continue
            stored_external_id = f"{project_id}:{external_id}"
            existing = db.query(Quest).filter(Quest.external_source == "ticktick", Quest.external_id == stored_external_id).one_or_none()
            due_date = ticktick_task_date(task)
            title = task.get("title", "TickTick task")
            tags = task.get("tags") or []
            subject = infer_subject(project.get("name") or "TickTick", tags, title)
            difficulty = ticktick_difficulty(task, due_date)
            xp_reward = xp_for_integration_difficulty(difficulty)
            quest_type = quest_type_for_due_date(due_date.date() if due_date else None)
            description = ticktick_description(task, tags)
            if not existing:
                existing = Quest(
                    title=title,
                    description=description,
                    subject=subject,
                    type=quest_type,
                    difficulty=difficulty,
                    xp_reward=xp_reward,
                    due_date=due_date.date() if due_date else None,
                    external_source="ticktick",
                    external_id=stored_external_id,
                )
                db.add(existing)
                created += 1
            else:
                existing.title = title
                existing.description = description
                existing.subject = subject
                existing.difficulty = difficulty
                existing.xp_reward = xp_reward
                existing.type = quest_type
                existing.due_date = due_date.date() if due_date else None
                updated += 1
            if task.get("status") == 2 and not existing.completed:
                existing.completed = True
                existing.completed_at = datetime.now()
                db.flush()
                award_xp(db, existing.xp_reward, f"Completed in TickTick: {existing.title}", existing.subject, "ticktick", existing.id)
                completed_awarded += 1
    db.commit()
    return {"synced": True, "mode": "oauth", "created": created, "updated": updated, "completed_awarded": completed_awarded, "projects": len(projects)}


def ticktick_inventory(db: Session) -> dict:
    token = get_token(db, "ticktick")
    stored_quests = db.query(Quest).filter(Quest.external_source == "ticktick").order_by(Quest.completed.asc(), Quest.due_date.asc().nullslast()).all()
    if not token:
        return {
            "connected": False,
            "source": "local_cache",
            "projects": [
                {
                    "id": "local-cache",
                    "name": "Imported TickTick quests",
                    "total": len(stored_quests),
                    "open": len([quest for quest in stored_quests if not quest.completed]),
                    "completed": len([quest for quest in stored_quests if quest.completed]),
                    "tasks": [stored_ticktick_task_payload(quest) for quest in stored_quests],
                }
            ],
            "generated_quests": [quest_game_payload(quest) for quest in stored_quests],
        }

    headers = {"Authorization": f"Bearer {token.access_token}"}
    projects_response = httpx.get(f"{TICKTICK_API}/project", headers=headers, timeout=20)
    projects_response.raise_for_status()
    projects_payload = []
    for project in projects_response.json():
        project_id = project.get("id")
        if not project_id:
            continue
        data_response = httpx.get(f"{TICKTICK_API}/project/{project_id}/data", headers=headers, timeout=20)
        data_response.raise_for_status()
        tasks = []
        for task in data_response.json().get("tasks", []):
            due_date = ticktick_task_date(task)
            tags = task.get("tags") or []
            difficulty = ticktick_difficulty(task, due_date)
            tasks.append(
                {
                    "id": task.get("id"),
                    "project_id": project_id,
                    "title": task.get("title", "TickTick task"),
                    "content": task.get("content") or "",
                    "status": "completed" if task.get("status") == 2 else "open",
                    "priority": int(task.get("priority") or 0),
                    "tags": tags,
                    "due_date": due_date.date().isoformat() if due_date else None,
                    "raw_due_date": task.get("dueDate"),
                    "raw_start_date": task.get("startDate"),
                    "is_all_day": bool(task.get("isAllDay")),
                    "time_zone": task.get("timeZone"),
                    "subject": infer_subject(project.get("name") or "TickTick", tags, task.get("title", "")),
                    "difficulty": difficulty,
                    "xp_reward": xp_for_integration_difficulty(difficulty),
                    "quest_type": quest_type_for_due_date(due_date.date() if due_date else None),
                    "interpretation": ticktick_interpretation(task, due_date, project.get("name") or "TickTick"),
                }
            )
        projects_payload.append(
            {
                "id": project_id,
                "name": project.get("name", "TickTick project"),
                "total": len(tasks),
                "open": len([task for task in tasks if task["status"] != "completed"]),
                "completed": len([task for task in tasks if task["status"] == "completed"]),
                "tasks": tasks,
            }
        )
    return {
        "connected": True,
        "source": "ticktick_open_api",
        "projects": projects_payload,
        "generated_quests": [quest_game_payload(quest) for quest in stored_quests],
    }


def update_ticktick_task(db: Session, project_id: str, task_id: str, payload: dict) -> dict:
    token = get_token(db, "ticktick")
    if not token:
        return {"updated": False, "message": "TickTick is not connected."}
    body = {
        "id": task_id,
        "projectId": project_id,
        "title": payload.get("title", "").strip() or "Untitled task",
        "content": payload.get("content") or "",
        "priority": int(payload.get("priority") or 0),
    }
    due_date = payload.get("due_date")
    if due_date:
        body["dueDate"] = format_ticktick_due_date(due_date)
    else:
        body["dueDate"] = None
    response = httpx.post(
        f"{TICKTICK_API}/task/{task_id}",
        headers={"Authorization": f"Bearer {token.access_token}"},
        json=body,
        timeout=20,
    )
    response.raise_for_status()
    sync_ticktick_tasks(db)
    return {"updated": True, "task_id": task_id, "project_id": project_id}


def complete_ticktick_task(db: Session, quest: Quest) -> bool:
    token = get_token(db, "ticktick")
    if quest.external_id and quest.external_id.startswith("fallback:"):
        return False
    if not token or not quest.external_id:
        return False
    project_id, task_id = split_ticktick_external_id(quest.external_id)
    if not project_id or not task_id:
        return False
    response = httpx.post(
        f"{TICKTICK_API}/project/{project_id}/task/{task_id}/complete",
        headers={"Authorization": f"Bearer {token.access_token}"},
        timeout=20,
    )
    response.raise_for_status()
    return True


def sync_google_events(settings: Settings, db: Session) -> dict:
    access_token = google_access_token(settings, db)
    if not access_token:
        return {"synced": False, "mode": "not_connected", "created": 0, "updated": 0, "message": "Google Calendar is not connected. No mock events were created."}

    now = datetime.utcnow()
    response = httpx.get(
        f"{GOOGLE_CALENDAR_API}/calendars/{settings.google_calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": now.isoformat() + "Z",
            "timeMax": (now + timedelta(days=14)).isoformat() + "Z",
            "singleEvents": "true",
            "orderBy": "startTime",
        },
        timeout=20,
    )
    response.raise_for_status()
    created = 0
    updated = 0
    quests_created = 0
    bosses_created = 0
    for item in response.json().get("items", []):
        external_id = item.get("id")
        if not external_id:
            continue
        start = parse_google_datetime(item.get("start", {}))
        end = parse_google_datetime(item.get("end", {}))
        if not start or not end:
            continue
        existing = db.query(CalendarEvent).filter(CalendarEvent.external_source == "google_calendar", CalendarEvent.external_id == external_id).one_or_none()
        title = item.get("summary", "Calendar event")
        description = item.get("description") or ""
        is_study_block = detect_study_block(f"{title} {description}") or item.get("eventType") == "focusTime"
        if not existing:
            existing = CalendarEvent(
                title=title,
                starts_at=start,
                ends_at=end,
                is_study_block=is_study_block,
                external_source="google_calendar",
                external_id=external_id,
            )
            db.add(existing)
            created += 1
        else:
            existing.title = title
            existing.starts_at = start
            existing.ends_at = end
            existing.is_study_block = is_study_block
            updated += 1
        generated = synthesize_calendar_gameplay(db, item, start, end, is_study_block)
        quests_created += generated["quests_created"]
        bosses_created += generated["bosses_created"]
    db.commit()
    return {"synced": True, "mode": "oauth", "created": created, "updated": updated, "quests_created": quests_created, "bosses_created": bosses_created}


def google_calendar_inventory(settings: Settings, db: Session) -> dict:
    access_token = google_access_token(settings, db)
    stored_events = db.query(CalendarEvent).filter(CalendarEvent.external_source == "google_calendar").order_by(CalendarEvent.starts_at.asc()).all()
    generated_quests = db.query(Quest).filter(Quest.external_source == "google_calendar").order_by(Quest.completed.asc(), Quest.due_date.asc().nullslast()).all()
    generated_bosses = db.query(BossFight).order_by(BossFight.completed.asc(), BossFight.exam_date.asc().nullslast()).all()
    if not access_token:
        return {
            "connected": False,
            "source": "local_cache",
            "events": [stored_calendar_event_payload(event) for event in stored_events],
            "study_blocks": [stored_calendar_event_payload(event) for event in stored_events if event.is_study_block],
            "generated_quests": [quest_game_payload(quest) for quest in generated_quests],
            "boss_fights": [boss_game_payload(boss) for boss in generated_bosses],
        }

    now = datetime.utcnow()
    response = httpx.get(
        f"{GOOGLE_CALENDAR_API}/calendars/{settings.google_calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": (now - timedelta(days=7)).isoformat() + "Z",
            "timeMax": (now + timedelta(days=30)).isoformat() + "Z",
            "singleEvents": "true",
            "orderBy": "startTime",
        },
        timeout=20,
    )
    response.raise_for_status()
    events = []
    for item in response.json().get("items", []):
        start = parse_google_datetime(item.get("start", {}))
        end = parse_google_datetime(item.get("end", {}))
        if not start or not end:
            continue
        title = item.get("summary", "Calendar event")
        description = item.get("description") or ""
        is_study_block = detect_study_block(f"{title} {description}") or item.get("eventType") == "focusTime"
        events.append(
            {
                "id": item.get("id"),
                "title": title,
                "description": description,
                "starts_at": start.isoformat(),
                "ends_at": end.isoformat(),
                "event_type": item.get("eventType", "default"),
                "is_study_block": is_study_block,
                "subject": infer_calendar_subject(title, description),
                "interpretation": calendar_interpretation(item, is_study_block),
            }
        )
    return {
        "connected": True,
        "source": "google_calendar_api",
        "events": events,
        "study_blocks": [event for event in events if event["is_study_block"]],
        "generated_quests": [quest_game_payload(quest) for quest in generated_quests],
        "boss_fights": [boss_game_payload(boss) for boss in generated_bosses],
    }


def create_google_event(settings: Settings, db: Session, title: str, starts_at: datetime, ends_at: datetime) -> str | None:
    access_token = google_access_token(settings, db)
    if not access_token:
        return None
    response = httpx.post(
        f"{GOOGLE_CALENDAR_API}/calendars/{settings.google_calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "summary": title,
            "description": "Created from Gamify Study RPG. Treat this block as protected focus time.",
            "start": {"dateTime": starts_at.isoformat()},
            "end": {"dateTime": ends_at.isoformat()},
            "eventType": "focusTime" if detect_study_block(title) else "default",
            "extendedProperties": {"private": {"gamify": "study_block", "xp_hint": "30"}},
            "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 10}]},
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("id")


def seed_ticktick_fallback(db: Session) -> dict:
    today = datetime.now().date()
    existing = db.query(Quest).filter(Quest.external_source == "ticktick").count()
    if existing == 0:
        db.add(
            Quest(
                title="TickTick fallback: refine one priority task",
                subject="TickTick",
                type="daily",
                difficulty="medium",
                xp_reward=30,
                due_date=today,
                external_source="ticktick",
                external_id="fallback:local",
            )
        )
        db.commit()
    return {"synced": True, "mode": "manual_fallback", "created": 1 if existing == 0 else 0}


def seed_google_fallback(db: Session) -> dict:
    now = datetime.now().replace(second=0, microsecond=0)
    existing = db.query(CalendarEvent).filter(CalendarEvent.external_source == "google_calendar").count()
    if existing == 0:
        db.add(
            CalendarEvent(
                title="Revision block from calendar fallback",
                starts_at=now + timedelta(hours=3),
                ends_at=now + timedelta(hours=4),
                is_study_block=True,
                external_source="google_calendar",
                external_id="fallback:local",
            )
        )
        db.commit()
    return {"synced": True, "mode": "manual_fallback", "created": 1 if existing == 0 else 0}


def priority_to_difficulty(priority: int) -> str:
    if priority >= 5:
        return "hard"
    if priority >= 3:
        return "medium"
    return "easy"


def ticktick_difficulty(task: dict, due_date: datetime | None) -> str:
    title = (task.get("title") or "").lower()
    content = (task.get("content") or "").lower()
    priority = int(task.get("priority") or 0)
    if any(word in f"{title} {content}" for word in EXAM_WORDS):
        return "boss"
    if priority >= 5:
        return "hard"
    if due_date and due_date.date() < date.today():
        return "hard"
    if any(word in f"{title} {content}" for word in ASSIGNMENT_WORDS + PRACTICE_WORDS):
        return "hard"
    if priority >= 3 or (due_date and due_date.date() <= date.today() + timedelta(days=2)):
        return "medium"
    return "easy"


def xp_for_integration_difficulty(difficulty: str) -> int:
    return {"easy": 10, "medium": 30, "hard": 50, "boss": 200}.get(difficulty, 10)


def quest_type_for_due_date(due_date: date | None) -> str:
    if not due_date:
        return "manual"
    if due_date <= date.today():
        return "daily"
    if due_date <= date.today() + timedelta(days=7):
        return "weekly"
    return "manual"


def infer_subject(project_name: str, tags: list[str], title: str) -> str:
    for tag in tags:
        cleaned = str(tag).replace("#", "").strip()
        if cleaned:
            return cleaned.title()
    if project_name and project_name.lower() not in {"inbox", "ticktick"}:
        return project_name
    lowered = title.lower()
    for subject in ("math", "physics", "chemistry", "biology", "english", "history", "economics", "coding", "programming"):
        if subject in lowered:
            return subject.title()
    return project_name or "General"


def ticktick_description(task: dict, tags: list[str]) -> str:
    parts = []
    if task.get("content"):
        parts.append(task["content"])
    if tags:
        parts.append("Tags: " + ", ".join(str(tag) for tag in tags))
    if task.get("priority"):
        parts.append(f"TickTick priority: {task['priority']}")
    return "\n".join(parts)


def ticktick_interpretation(task: dict, due_date: datetime | None, project_name: str) -> dict:
    title = task.get("title", "TickTick task")
    content = task.get("content") or ""
    tags = task.get("tags") or []
    difficulty = ticktick_difficulty(task, due_date)
    reasons = []
    text = f"{title} {content}".lower()
    priority = int(task.get("priority") or 0)
    if priority:
        reasons.append(f"TickTick priority {priority} raises importance.")
    if due_date:
        if due_date.date() < date.today():
            reasons.append("Overdue tasks become hard quests.")
        elif due_date.date() <= date.today() + timedelta(days=2):
            reasons.append("Near due date makes this a near-term quest.")
    if any(word in text for word in EXAM_WORDS):
        reasons.append("Exam/test wording marks it as boss-level prep.")
    if any(word in text for word in ASSIGNMENT_WORDS):
        reasons.append("Assignment/deadline wording turns it into progress work.")
    if any(word in text for word in PRACTICE_WORDS):
        reasons.append("Practice/question wording maps to higher XP study work.")
    if tags:
        reasons.append("Tags are used as subject labels before project names.")
    if not reasons:
        reasons.append("Standard task: small quest XP.")
    return {
        "used_as": "completed_xp" if task.get("status") == 2 else "quest",
        "subject": infer_subject(project_name, tags, title),
        "difficulty": difficulty,
        "xp_reward": xp_for_integration_difficulty(difficulty),
        "quest_type": quest_type_for_due_date(due_date.date() if due_date else None),
        "reasons": reasons,
    }


def calendar_interpretation(item: dict, is_study_block: bool) -> dict:
    title = item.get("summary", "Calendar event")
    description = item.get("description") or ""
    text = f"{title} {description}".lower()
    reasons = []
    used_as = "timeline"
    difficulty = "easy"
    xp_reward = 0
    if item.get("eventType") == "focusTime":
        reasons.append("Google marks this as focus time.")
    if is_study_block:
        used_as = "study_block"
        difficulty = "medium"
        xp_reward = 30
        reasons.append("Study-related wording makes this a focus quest candidate.")
    if any(word in text for word in ASSIGNMENT_WORDS):
        used_as = "quest"
        difficulty = "hard"
        xp_reward = 50
        reasons.append("Assignment/deadline wording becomes hard quest XP.")
    if any(word in text for word in PRACTICE_WORDS):
        used_as = "quest"
        difficulty = "hard"
        xp_reward = 50
        reasons.append("Practice/question wording becomes study progress XP.")
    if any(word in text for word in EXAM_WORDS):
        used_as = "boss_fight"
        difficulty = "boss"
        xp_reward = 200
        reasons.append("Exam/test wording creates boss fight prep.")
    if not reasons:
        reasons.append("Shown in timeline only; not gamified unless it looks study-related.")
    return {
        "used_as": used_as,
        "subject": infer_calendar_subject(title, description),
        "difficulty": difficulty,
        "xp_reward": xp_reward,
        "reasons": reasons,
    }


def quest_game_payload(quest: Quest) -> dict:
    return {
        "id": quest.id,
        "title": quest.title,
        "subject": quest.subject,
        "type": quest.type,
        "difficulty": quest.difficulty,
        "xp_reward": quest.xp_reward,
        "due_date": quest.due_date.isoformat() if quest.due_date else None,
        "completed": quest.completed,
        "external_source": quest.external_source,
        "description": quest.description,
    }


def stored_ticktick_task_payload(quest: Quest) -> dict:
    project_id, task_id = split_ticktick_external_id(quest.external_id or "")
    return {
        "id": task_id or quest.external_id,
        "project_id": project_id,
        "title": quest.title,
        "content": quest.description,
        "status": "completed" if quest.completed else "open",
        "priority": None,
        "tags": [],
        "due_date": quest.due_date.isoformat() if quest.due_date else None,
        "raw_due_date": None,
        "raw_start_date": None,
        "is_all_day": False,
        "time_zone": None,
        "subject": quest.subject,
        "difficulty": quest.difficulty,
        "xp_reward": quest.xp_reward,
        "quest_type": quest.type,
        "interpretation": {
            "used_as": "completed_xp" if quest.completed else "quest",
            "subject": quest.subject,
            "difficulty": quest.difficulty,
            "xp_reward": quest.xp_reward,
            "quest_type": quest.type,
            "reasons": ["Loaded from the local Gamify quest cache."],
        },
    }


def stored_calendar_event_payload(event: CalendarEvent) -> dict:
    return {
        "id": event.external_id,
        "title": event.title,
        "description": "",
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        "event_type": "local",
        "is_study_block": event.is_study_block,
        "subject": "Calendar",
        "interpretation": {
            "used_as": "study_block" if event.is_study_block else "timeline",
            "subject": "Calendar",
            "difficulty": "medium" if event.is_study_block else "easy",
            "xp_reward": 30 if event.is_study_block else 0,
            "reasons": ["Loaded from the local Gamify calendar cache."],
        },
    }


def boss_game_payload(boss: BossFight) -> dict:
    return {
        "id": boss.id,
        "title": boss.title,
        "subject": boss.subject,
        "exam_date": boss.exam_date.isoformat() if boss.exam_date else None,
        "duration_minutes": boss.duration_minutes,
        "difficulty": boss.difficulty,
        "completed": boss.completed,
        "xp_awarded": boss.xp_awarded,
        "topics": [topic for topic in boss.topics.split("\n") if topic],
    }


def synthesize_calendar_gameplay(db: Session, item: dict, start: datetime, end: datetime, is_study_block: bool) -> dict:
    title = item.get("summary", "Calendar event")
    description = item.get("description") or ""
    external_id = item.get("id")
    text = f"{title} {description}".lower()
    subject = infer_calendar_subject(title, description)
    quests_created = 0
    bosses_created = 0

    if any(word in text for word in EXAM_WORDS):
        existing_boss = db.query(BossFight).filter(BossFight.title == f"Prepare for {title}", BossFight.exam_date == start.date()).one_or_none()
        if not existing_boss:
            db.add(
                BossFight(
                    title=f"Prepare for {title}",
                    subject=subject,
                    exam_date=start.date(),
                    duration_minutes=max(45, int((end - start).total_seconds() // 60)),
                    difficulty="boss",
                    topics=calendar_topics(description, title),
                )
            )
            bosses_created += 1

    should_create_quest = is_study_block or any(word in text for word in ASSIGNMENT_WORDS + PRACTICE_WORDS)
    if should_create_quest and external_id:
        quest_external_id = f"{external_id}:calendar-quest"
        existing_quest = db.query(Quest).filter(Quest.external_source == "google_calendar", Quest.external_id == quest_external_id).one_or_none()
        if not existing_quest:
            if any(word in text for word in ASSIGNMENT_WORDS):
                difficulty = "hard"
                xp_reward = 50
                quest_title = f"Make progress on {title}"
            elif any(word in text for word in EXAM_WORDS):
                difficulty = "boss"
                xp_reward = 200
                quest_title = f"Boss prep: {title}"
            else:
                difficulty = "medium"
                xp_reward = 30
                quest_title = f"Attend focus block: {title}"
            db.add(
                Quest(
                    title=quest_title,
                    description=calendar_quest_description(item),
                    subject=subject,
                    type=quest_type_for_due_date(start.date()),
                    difficulty=difficulty,
                    xp_reward=xp_reward,
                    due_date=start.date(),
                    external_source="google_calendar",
                    external_id=quest_external_id,
                )
            )
            quests_created += 1

    return {"quests_created": quests_created, "bosses_created": bosses_created}


def infer_calendar_subject(title: str, description: str) -> str:
    text = f"{title} {description}".lower()
    for marker in ("subject:", "course:", "unit:"):
        if marker in text:
            after = text.split(marker, 1)[1].splitlines()[0].strip()
            if after:
                return after[:40].title()
    for subject in ("math", "physics", "chemistry", "biology", "english", "history", "economics", "coding", "programming"):
        if subject in text:
            return subject.title()
    return "Calendar"


def calendar_topics(description: str, title: str) -> str:
    lines = [line.strip("- •\t ") for line in description.splitlines() if line.strip()]
    if lines:
        return "\n".join(lines[:8])
    return f"Review scope for {title}\nPractice active recall\nComplete timed questions"


def calendar_quest_description(item: dict) -> str:
    pieces = []
    if item.get("description"):
        pieces.append(item["description"])
    if item.get("htmlLink"):
        pieces.append(f"Calendar link: {item['htmlLink']}")
    pieces.append("Generated from Google Calendar sync.")
    return "\n".join(pieces)


def ticktick_task_date(task: dict) -> datetime | None:
    return parse_ticktick_date(task.get("dueDate") or task.get("startDate"))


def parse_ticktick_date(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
    ):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=None)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(cleaned).replace(tzinfo=None)
    except ValueError:
        return None


def format_ticktick_due_date(value: str) -> str:
    parsed = parse_ticktick_date(value)
    if not parsed:
        parsed = datetime.strptime(value[:10], "%Y-%m-%d").replace(hour=12)
    if parsed.hour == 0 and parsed.minute == 0 and len(value) <= 10:
        parsed = parsed.replace(hour=12)
    return parsed.strftime("%Y-%m-%dT%H:%M:%S+0000")


def parse_google_datetime(value: dict) -> datetime | None:
    raw = value.get("dateTime") or value.get("date")
    if not raw:
        return None
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)


def split_ticktick_external_id(external_id: str) -> tuple[str | None, str | None]:
    if ":" not in external_id:
        # TODO: Store projectId and taskId separately if TickTick changes project data payload shape.
        return None, external_id
    project_id, task_id = external_id.split(":", 1)
    return project_id, task_id
