from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from httpx import HTTPError
from sqlalchemy.orm import Session
from urllib.parse import urlencode

from app.core.config import Settings, get_settings
from app.db.session import engine, get_db
from app.models.entities import Achievement, BossFight, CalendarEvent, Mastery, PomodoroTask, Quest, StudySession
from app.schemas.dto import (
    AssistantMessageCreate,
    AssistantMessageOut,
    AssistantMemoryOut,
    AssistantStateOut,
    BossFightCreate,
    BossFightOut,
    CalendarEventCreate,
    CalendarEventOut,
    DashboardOut,
    PomodoroBoardOut,
    PomodoroSettingsUpdate,
    PomodoroTaskCreate,
    PomodoroTaskUpdate,
    ProfileOut,
    QuestCreate,
    QuestOut,
    SettingsUpdate,
    StudySessionCreate,
    StudySessionOut,
)
from app.services.assistant_ai import load_assistant_state, process_message
from app.services.gamification import (
    award_xp,
    get_or_create_profile,
    goal_progress,
    heatmap,
    level_for_xp,
    locked_achievements,
    rank_progression,
    session_xp,
    xp_for_difficulty,
)
from app.services.pomodoro import (
    advance_task,
    create_task,
    delete_task,
    get_or_create_pomodoro_settings,
    pomodoro_board,
    serialize_settings,
    serialize_task,
    set_active_task,
    update_task,
)
from app.services.workflow_ai import analyze_workflow
from app.services.integrations import (
    complete_ticktick_task,
    create_google_event,
    detect_study_block,
    exchange_google_code,
    exchange_ticktick_code,
    get_token,
    google_calendar_inventory,
    google_status,
    sync_google_events,
    sync_ticktick_tasks,
    ticktick_inventory,
    ticktick_status,
    update_ticktick_task,
)

router = APIRouter(prefix="/api")


def profile_out(db: Session) -> ProfileOut:
    profile = get_or_create_profile(db)
    level = level_for_xp(profile.xp)
    return ProfileOut(
        id=profile.id,
        display_name=profile.display_name,
        xp=profile.xp,
        current_streak=profile.current_streak,
        longest_streak=profile.longest_streak,
        combo_count=profile.combo_count,
        daily_xp_goal=profile.daily_xp_goal,
        weekly_xp_goal=profile.weekly_xp_goal,
        streak_freezes=profile.streak_freezes,
        shrivaishnava_mode=profile.shrivaishnava_mode,
        lock_media_url=profile.lock_media_url or "",
        lock_media_position=profile.lock_media_position or "right",
        lock_show_timer=profile.lock_show_timer,
        lock_show_stats=profile.lock_show_stats,
        lock_show_tasks=profile.lock_show_tasks,
        lock_show_quote=profile.lock_show_quote,
        **level,
    )


def boss_out(boss: BossFight) -> BossFightOut:
    topics = [topic for topic in boss.topics.split("\n") if topic]
    return BossFightOut(
        id=boss.id,
        subject=boss.subject,
        title=boss.title,
        exam_date=boss.exam_date,
        duration_minutes=boss.duration_minutes,
        difficulty=boss.difficulty,
        topics=topics,
        completed=boss.completed,
        xp_awarded=boss.xp_awarded,
    )


def integration_payload(db: Session, settings: Settings) -> dict:
    profile = get_or_create_profile(db)
    return {
        "ticktick": ticktick_status(settings, profile.ticktick_connected, bool(get_token(db, "ticktick"))),
        "google_calendar": google_status(settings, profile.google_connected, bool(get_token(db, "google_calendar"))),
    }


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> DashboardOut:
    today = date.today()
    quests = (
        db.query(Quest)
        .filter((Quest.completed.is_(False)) | (Quest.completed_at >= datetime.combine(today, datetime.min.time())))
        .order_by(Quest.completed.asc(), Quest.due_date.asc().nullslast(), Quest.created_at.desc())
        .limit(20)
        .all()
    )
    sessions = db.query(StudySession).order_by(StudySession.created_at.desc()).limit(8).all()
    bosses = db.query(BossFight).order_by(BossFight.completed.asc(), BossFight.exam_date.asc().nullslast()).limit(8).all()
    events = db.query(CalendarEvent).filter(CalendarEvent.ends_at >= datetime.now()).order_by(CalendarEvent.starts_at.asc()).limit(8).all()
    achievements = [
        {"key": row.key, "title": row.title, "description": row.description, "unlocked_at": row.unlocked_at}
        for row in db.query(Achievement).order_by(Achievement.unlocked_at.desc()).all()
    ]
    mastery = [{"subject": row.subject, "points": row.points} for row in db.query(Mastery).order_by(Mastery.points.desc()).all()]
    profile = get_or_create_profile(db)
    return DashboardOut(
        profile=profile_out(db),
        quests=[QuestOut.model_validate(row) for row in quests],
        sessions=[StudySessionOut.model_validate(row) for row in sessions],
        pomodoro=PomodoroBoardOut.model_validate(pomodoro_board(db)),
        bosses=[boss_out(row) for row in bosses],
        events=[CalendarEventOut.model_validate(row) for row in events],
        achievements=achievements,
        mastery=mastery,
        heatmap=heatmap(db),
        integrations=integration_payload(db, settings),
        goals=goal_progress(db, profile),
        ranks=rank_progression(profile.xp),
        locked_achievements=locked_achievements(db),
        quote=quote_for_mode(profile.shrivaishnava_mode),
    )


@router.get("/health")
def health(settings: Settings = Depends(get_settings), db: Session = Depends(get_db)) -> dict:
    database_ok = True
    database_error = None
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except Exception as exc:  # pragma: no cover - health route should report any DB failure.
        database_ok = False
        database_error = str(exc)

    ticktick_configured = bool(settings.ticktick_client_id and settings.ticktick_client_secret)
    google_configured = bool(settings.google_client_id and settings.google_client_secret)
    ticktick_connected = bool(get_token(db, "ticktick"))
    google_connected = bool(get_token(db, "google_calendar"))
    return {
        "status": "ok" if database_ok else "degraded",
        "app": settings.app_name,
        "database": {
            "ok": database_ok,
            "url_scheme": str(engine.url).split(":", 1)[0],
            "error": database_error,
        },
        "frontend_url": settings.frontend_url,
        "cors_origins": [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
        "integrations": {
            "ticktick": {
                "configured": ticktick_configured,
                "connected": ticktick_connected,
                "redirect_uri": settings.ticktick_redirect_uri,
                "status": "connected" if ticktick_connected else ("not_connected_yet" if not ticktick_configured else "credentials_configured"),
            },
            "google_calendar": {
                "configured": google_configured,
                "connected": google_connected,
                "redirect_uri": settings.google_redirect_uri,
                "status": "connected" if google_connected else ("not_connected_yet" if not google_configured else "credentials_configured"),
            },
        },
    }


@router.get("/pomodoro", response_model=PomodoroBoardOut)
def get_pomodoro_board(db: Session = Depends(get_db)) -> PomodoroBoardOut:
    return PomodoroBoardOut.model_validate(pomodoro_board(db))


@router.get("/assistant", response_model=AssistantStateOut)
def get_assistant_state(db: Session = Depends(get_db)) -> AssistantStateOut:
    state = load_assistant_state(db)
    return AssistantStateOut(
        messages=[AssistantMessageOut.model_validate(row) for row in state["messages"]],
        memories=[AssistantMemoryOut.model_validate(row) for row in state["memories"]],
        summary=state["summary"],
    )


@router.post("/assistant/message")
def send_assistant_message(payload: AssistantMessageCreate, db: Session = Depends(get_db)) -> dict:
    result = process_message(db, payload.message)
    return {
        "message": AssistantMessageOut.model_validate(result["message"]),
        "needs_follow_up": result["needs_follow_up"],
        "follow_up_question": result["follow_up_question"],
        "memories_added": result["memories_added"],
        "summary": result["summary"],
    }


@router.patch("/pomodoro/settings")
def update_pomodoro_settings(payload: PomodoroSettingsUpdate, db: Session = Depends(get_db)) -> dict:
    settings = get_or_create_pomodoro_settings(db)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return pomodoro_board(db)


@router.post("/pomodoro/tasks")
def create_pomodoro_task(payload: PomodoroTaskCreate, db: Session = Depends(get_db)) -> dict:
    task = create_task(db, payload.title, payload.subject, payload.estimated_pomodoros)
    return serialize_task(task)


@router.patch("/pomodoro/tasks/{task_id}")
def patch_pomodoro_task(task_id: int, payload: PomodoroTaskUpdate, db: Session = Depends(get_db)) -> dict:
    task = db.get(PomodoroTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pomodoro task not found")
    return serialize_task(update_task(db, task, payload.model_dump(exclude_unset=True)))


@router.post("/pomodoro/tasks/{task_id}/advance")
def advance_pomodoro_task(task_id: int, payload: dict | None = None, db: Session = Depends(get_db)) -> dict:
    task = db.get(PomodoroTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pomodoro task not found")
    amount = 1
    if payload and isinstance(payload, dict) and payload.get("amount") is not None:
        try:
            amount = int(payload["amount"])
        except Exception:
            amount = 1
    return serialize_task(advance_task(db, task, amount))


@router.post("/pomodoro/tasks/{task_id}/activate")
def activate_pomodoro_task(task_id: int, db: Session = Depends(get_db)) -> dict:
    task = db.get(PomodoroTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pomodoro task not found")
    settings = set_active_task(db, task_id)
    return {"settings": serialize_settings(settings), "active_task": serialize_task(task)}


@router.delete("/pomodoro/tasks/{task_id}")
def delete_pomodoro_task(task_id: int, db: Session = Depends(get_db)) -> dict:
    task = db.get(PomodoroTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pomodoro task not found")
    delete_task(db, task)
    settings = get_or_create_pomodoro_settings(db)
    if settings.active_task_id == task_id:
        settings.active_task_id = None
        db.commit()
    return {"deleted": True}


@router.get("/deployment-config")
def deployment_config(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "backend_url": settings.backend_public_url,
        "frontend_url": settings.frontend_url,
        "ticktick_redirect_uri": settings.ticktick_redirect_uri,
        "google_redirect_uri": settings.google_redirect_uri,
        "ticktick_credentials_configured": bool(settings.ticktick_client_id and settings.ticktick_client_secret),
        "google_credentials_configured": bool(settings.google_client_id and settings.google_client_secret),
    }


def oauth_return_url(settings: Settings, provider: str, ok: bool, message: str) -> str:
    params = urlencode({"integration": provider, "connected": str(ok).lower(), "message": message})
    return f"{settings.frontend_url}?{params}"


@router.get("/quests", response_model=list[QuestOut])
def list_quests(db: Session = Depends(get_db)) -> list[QuestOut]:
    rows = db.query(Quest).order_by(Quest.completed.asc(), Quest.due_date.asc().nullslast()).all()
    return [QuestOut.model_validate(row) for row in rows]


@router.post("/quests", response_model=QuestOut)
def create_quest(payload: QuestCreate, db: Session = Depends(get_db)) -> QuestOut:
    data = payload.model_dump()
    if not data.get("xp_reward"):
        data["xp_reward"] = xp_for_difficulty(data["difficulty"])
    else:
        data["xp_reward"] = max(data["xp_reward"], xp_for_difficulty(data["difficulty"]))
    quest = Quest(**data)
    db.add(quest)
    db.commit()
    db.refresh(quest)
    return QuestOut.model_validate(quest)


@router.post("/quests/{quest_id}/complete", response_model=ProfileOut)
def complete_quest(quest_id: int, db: Session = Depends(get_db)) -> ProfileOut:
    quest = db.get(Quest, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")
    if not quest.completed:
        if quest.external_source == "ticktick":
            try:
                complete_ticktick_task(db, quest)
            except HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"TickTick completion failed: {exc}") from exc
        quest.completed = True
        quest.completed_at = datetime.now()
        db.commit()
        award_xp(db, quest.xp_reward, f"Completed quest: {quest.title}", quest.subject, quest.external_source or "quest", quest.id)
    return profile_out(db)


@router.post("/sessions", response_model=StudySessionOut)
def create_session(payload: StudySessionCreate, db: Session = Depends(get_db)) -> StudySessionOut:
    xp = session_xp(payload.minutes, payload.mode)
    session = StudySession(**payload.model_dump(), xp_awarded=xp)
    db.add(session)
    db.commit()
    db.refresh(session)
    award_xp(db, xp, f"{payload.minutes} minute {payload.mode.replace('_', ' ')} session", payload.subject, "study_session", session.id)
    return StudySessionOut.model_validate(session)


@router.get("/bosses", response_model=list[BossFightOut])
def list_bosses(db: Session = Depends(get_db)) -> list[BossFightOut]:
    return [boss_out(row) for row in db.query(BossFight).order_by(BossFight.completed.asc(), BossFight.created_at.desc()).all()]


@router.post("/bosses", response_model=BossFightOut)
def create_boss(payload: BossFightCreate, db: Session = Depends(get_db)) -> BossFightOut:
    boss = BossFight(**payload.model_dump(exclude={"topics"}), topics="\n".join(payload.topics))
    db.add(boss)
    db.commit()
    db.refresh(boss)
    return boss_out(boss)


@router.post("/bosses/{boss_id}/complete", response_model=ProfileOut)
def complete_boss(boss_id: int, db: Session = Depends(get_db)) -> ProfileOut:
    boss = db.get(BossFight, boss_id)
    if not boss:
        raise HTTPException(status_code=404, detail="Boss fight not found")
    if not boss.completed:
        boss.completed = True
        boss.completed_at = datetime.now()
        boss.xp_awarded = 200
        db.commit()
        award_xp(db, 200, f"Boss fight cleared: {boss.title}", boss.subject, "boss_fight", boss.id)
    return profile_out(db)


@router.get("/calendar", response_model=list[CalendarEventOut])
def list_calendar(db: Session = Depends(get_db)) -> list[CalendarEventOut]:
    rows = db.query(CalendarEvent).order_by(CalendarEvent.starts_at.asc()).all()
    return [CalendarEventOut.model_validate(row) for row in rows]


@router.post("/calendar/study-block", response_model=CalendarEventOut)
def create_study_block(payload: CalendarEventCreate, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> CalendarEventOut:
    external_id = None
    external_source = None
    try:
        external_id = create_google_event(settings, db, payload.title, payload.starts_at, payload.ends_at)
        external_source = "google_calendar" if external_id else None
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Calendar event creation failed: {exc}") from exc
    event = CalendarEvent(
        title=payload.title,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        is_study_block=detect_study_block(payload.title) or True,
        external_source=external_source,
        external_id=external_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return CalendarEventOut.model_validate(event)


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    return {
        "profile": profile_out(db).model_dump(),
        "heatmap": heatmap(db),
        "mastery": [{"subject": row.subject, "points": row.points} for row in db.query(Mastery).order_by(Mastery.points.desc()).all()],
        "sessions": [StudySessionOut.model_validate(row).model_dump() for row in db.query(StudySession).order_by(StudySession.created_at.desc()).limit(30).all()],
    }


@router.patch("/settings", response_model=ProfileOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> ProfileOut:
    profile = get_or_create_profile(db)
    if payload.display_name is not None:
        profile.display_name = payload.display_name
    if payload.shrivaishnava_mode is not None:
        profile.shrivaishnava_mode = payload.shrivaishnava_mode
    if payload.daily_xp_goal is not None:
        profile.daily_xp_goal = payload.daily_xp_goal
    if payload.weekly_xp_goal is not None:
        profile.weekly_xp_goal = payload.weekly_xp_goal
    if payload.lock_media_url is not None:
        profile.lock_media_url = payload.lock_media_url.strip()
    if payload.lock_media_position is not None:
        profile.lock_media_position = payload.lock_media_position
    if payload.lock_show_timer is not None:
        profile.lock_show_timer = payload.lock_show_timer
    if payload.lock_show_stats is not None:
        profile.lock_show_stats = payload.lock_show_stats
    if payload.lock_show_tasks is not None:
        profile.lock_show_tasks = payload.lock_show_tasks
    if payload.lock_show_quote is not None:
        profile.lock_show_quote = payload.lock_show_quote
    db.commit()
    return profile_out(db)


@router.get("/integrations/status")
def integrations_status(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    return integration_payload(db, settings)


@router.get("/integrations/intelligence")
def integrations_intelligence(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    try:
        ticktick = ticktick_inventory(db)
        google = google_calendar_inventory(settings, db)
        imported_quests = db.query(Quest).filter(Quest.external_source.isnot(None)).count()
        study_events = db.query(CalendarEvent).filter(CalendarEvent.is_study_block.is_(True)).count()
        return {
            "summary": {
                "imported_quests": imported_quests,
                "study_events": study_events,
                "boss_fights": db.query(BossFight).count(),
                "open_ticktick_tasks": sum(project["open"] for project in ticktick.get("projects", [])),
                "google_study_blocks": len(google.get("study_blocks", [])),
            },
            "rules": [
                "TickTick tasks become quests. Priority, due date, tags, project name, and study words decide subject, difficulty, and XP.",
                "Completing a TickTick quest in Gamify also completes it in TickTick when OAuth is connected.",
                "Google Calendar events stay visible on the timeline. Study/focus/assignment events can create quests.",
                "Exam/test events become boss fight prep with 200 XP available after completion.",
                "Everything is explainable here before it affects XP, streaks, mastery, or boss fights.",
            ],
            "ticktick": ticktick,
            "google_calendar": google,
            "workflow": analyze_workflow(db, settings),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Workflow intelligence failed: {exc}") from exc


@router.get("/integrations/ticktick/auth")
def ticktick_auth(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    return ticktick_status(settings, get_or_create_profile(db).ticktick_connected)


@router.get("/integrations/ticktick/callback")
def ticktick_callback(code: str | None = None, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> RedirectResponse:
    if not code:
        return RedirectResponse(oauth_return_url(settings, "ticktick", False, "Missing OAuth code"))
    profile = get_or_create_profile(db)
    try:
        exchange_ticktick_code(settings, db, code)
    except HTTPError as exc:
        return RedirectResponse(oauth_return_url(settings, "ticktick", False, f"OAuth exchange failed: {exc.response.status_code if exc.response else 'network'}"))
    profile.ticktick_connected = True
    db.commit()
    return RedirectResponse(oauth_return_url(settings, "ticktick", True, "TickTick connected"))


@router.post("/integrations/ticktick/sync")
def ticktick_sync(db: Session = Depends(get_db)) -> dict:
    try:
        return sync_ticktick_tasks(db)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"TickTick sync failed: {exc}") from exc


@router.patch("/integrations/ticktick/tasks/{project_id}/{task_id}")
def ticktick_task_update(project_id: str, task_id: str, payload: dict, db: Session = Depends(get_db)) -> dict:
    try:
        return update_ticktick_task(db, project_id, task_id, payload)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"TickTick task update failed: {exc}") from exc


@router.get("/integrations/google/auth")
def google_auth(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    return google_status(settings, get_or_create_profile(db).google_connected)


@router.get("/integrations/google/callback")
def google_callback(code: str | None = None, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> RedirectResponse:
    if not code:
        return RedirectResponse(oauth_return_url(settings, "google_calendar", False, "Missing OAuth code"))
    profile = get_or_create_profile(db)
    try:
        exchange_google_code(settings, db, code)
    except HTTPError as exc:
        return RedirectResponse(oauth_return_url(settings, "google_calendar", False, f"OAuth exchange failed: {exc.response.status_code if exc.response else 'network'}"))
    profile.google_connected = True
    db.commit()
    return RedirectResponse(oauth_return_url(settings, "google_calendar", True, "Google Calendar connected"))


@router.post("/integrations/google/sync")
def google_sync(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    try:
        return sync_google_events(settings, db)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Calendar sync failed: {exc}") from exc


@router.post("/integrations/sync-all")
def sync_all(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    results: dict[str, dict] = {}
    errors: dict[str, str] = {}
    try:
        results["ticktick"] = sync_ticktick_tasks(db)
    except HTTPError as exc:
        errors["ticktick"] = f"{exc.response.status_code if exc.response else 'network'}"
    try:
        results["google_calendar"] = sync_google_events(settings, db)
    except HTTPError as exc:
        errors["google_calendar"] = f"{exc.response.status_code if exc.response else 'network'}"
    return {"synced": not errors, "results": results, "errors": errors}


@router.get("/anti-boredom")
def anti_boredom() -> dict:
    challenges = [
        ("speedrun", "Clear one narrow topic in 15 minutes."),
        ("teach_it_aloud", "Explain the concept out loud as if teaching a class."),
        ("no_notes", "Solve without notes, then check gaps."),
        ("question_sprint", "Complete a 10 question sprint."),
        ("flashcard_recall", "Recall flashcards before looking at answers."),
    ]
    import random

    key, prompt = random.choice(challenges)
    return {"type": key, "prompt": prompt, "xp_hint": 30}


def quote_for_mode(shrivaishnava_mode: bool) -> dict:
    if shrivaishnava_mode:
        return {
            "title": "Steady Sadhana",
            "body": "Small disciplined effort refines the mind. Keep the next action simple and sincere.",
        }
    return {
        "title": "Today's Mission",
        "body": "Win the next 25 minutes. The level takes care of itself after that.",
    }
