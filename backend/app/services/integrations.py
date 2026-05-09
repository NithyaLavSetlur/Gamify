from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import CalendarEvent, IntegrationToken, Quest

STUDY_WORDS = ("study", "uni", "exam", "revision", "assignment")
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
    # TickTick Open API uses OAuth 2.0 authorization code flow. Some apps require
    # HTTP Basic client auth, while others accept client_id/client_secret form fields.
    # This implementation uses form fields first because it is easiest to run locally.
    response = httpx.post(
        TICKTICK_TOKEN_URL,
        data={
            "client_id": settings.ticktick_client_id,
            "client_secret": settings.ticktick_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.ticktick_redirect_uri,
        },
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
        return seed_ticktick_fallback(db)

    headers = {"Authorization": f"Bearer {token.access_token}"}
    projects_response = httpx.get(f"{TICKTICK_API}/project", headers=headers, timeout=20)
    projects_response.raise_for_status()
    projects = projects_response.json()
    created = 0
    for project in projects:
        project_id = project.get("id")
        if not project_id:
            continue
        data_response = httpx.get(f"{TICKTICK_API}/project/{project_id}/data", headers=headers, timeout=20)
        data_response.raise_for_status()
        project_data = data_response.json()
        for task in project_data.get("tasks", []):
            if task.get("status") == 2:
                continue
            external_id = task.get("id")
            if not external_id:
                continue
            stored_external_id = f"{project_id}:{external_id}"
            existing = db.query(Quest).filter(Quest.external_source == "ticktick", Quest.external_id == stored_external_id).one_or_none()
            due_date = parse_ticktick_date(task.get("dueDate"))
            difficulty = priority_to_difficulty(task.get("priority", 0))
            if not existing:
                existing = Quest(
                    title=task.get("title", "TickTick task"),
                    description=task.get("content") or "",
                    subject=project.get("name") or "TickTick",
                    type="daily" if due_date and due_date.date() == datetime.now().date() else "manual",
                    difficulty=difficulty,
                    xp_reward={"easy": 10, "medium": 30, "hard": 50}.get(difficulty, 10),
                    due_date=due_date.date() if due_date else None,
                    external_source="ticktick",
                    external_id=stored_external_id,
                )
                db.add(existing)
                created += 1
            else:
                existing.title = task.get("title", existing.title)
                existing.description = task.get("content") or existing.description
                existing.difficulty = difficulty
                existing.due_date = due_date.date() if due_date else existing.due_date
    db.commit()
    return {"synced": True, "mode": "oauth", "created": created, "projects": len(projects)}


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
        return seed_google_fallback(db)

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
    for item in response.json().get("items", []):
        external_id = item.get("id")
        if not external_id:
            continue
        start = parse_google_datetime(item.get("start", {}))
        end = parse_google_datetime(item.get("end", {}))
        if not start or not end:
            continue
        existing = db.query(CalendarEvent).filter(CalendarEvent.external_source == "google_calendar", CalendarEvent.external_id == external_id).one_or_none()
        if not existing:
            existing = CalendarEvent(
                title=item.get("summary", "Calendar event"),
                starts_at=start,
                ends_at=end,
                is_study_block=detect_study_block(item.get("summary", "")),
                external_source="google_calendar",
                external_id=external_id,
            )
            db.add(existing)
            created += 1
        else:
            existing.title = item.get("summary", existing.title)
            existing.starts_at = start
            existing.ends_at = end
            existing.is_study_block = detect_study_block(existing.title)
    db.commit()
    return {"synced": True, "mode": "oauth", "created": created}


def create_google_event(settings: Settings, db: Session, title: str, starts_at: datetime, ends_at: datetime) -> str | None:
    access_token = google_access_token(settings, db)
    if not access_token:
        return None
    response = httpx.post(
        f"{GOOGLE_CALENDAR_API}/calendars/{settings.google_calendar_id}/events",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "summary": title,
            "description": "Created from Gamify Study RPG.",
            "start": {"dateTime": starts_at.isoformat()},
            "end": {"dateTime": ends_at.isoformat()},
            "eventType": "focusTime" if detect_study_block(title) else "default",
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


def parse_ticktick_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=None)
        except ValueError:
            continue
    return None


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
