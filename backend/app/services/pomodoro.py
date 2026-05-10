from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.entities import PomodoroSettings, PomodoroTask, StudySession
from app.services.gamification import award_xp


def get_or_create_pomodoro_settings(db: Session) -> PomodoroSettings:
    settings = db.get(PomodoroSettings, 1)
    if settings:
        return settings
    settings = PomodoroSettings(id=1)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def list_tasks(db: Session) -> list[PomodoroTask]:
    return (
        db.query(PomodoroTask)
        .order_by(PomodoroTask.completed.asc(), PomodoroTask.sort_order.asc(), PomodoroTask.created_at.desc())
        .all()
    )


def task_remaining(task: PomodoroTask) -> int:
    return max(0, task.estimated_pomodoros - task.completed_pomodoros)


def serialize_settings(settings: PomodoroSettings) -> dict:
    return {
        "id": settings.id,
        "work_minutes": settings.work_minutes,
        "short_break_minutes": settings.short_break_minutes,
        "long_break_minutes": settings.long_break_minutes,
        "sessions_before_long_break": settings.sessions_before_long_break,
        "auto_start_breaks": settings.auto_start_breaks,
        "auto_start_pomodoros": settings.auto_start_pomodoros,
        "sound_enabled": settings.sound_enabled,
        "active_task_id": settings.active_task_id,
    }


def serialize_task(task: PomodoroTask) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "subject": task.subject,
        "estimated_pomodoros": task.estimated_pomodoros,
        "completed_pomodoros": task.completed_pomodoros,
        "completed": task.completed,
        "sort_order": task.sort_order,
        "remaining_pomodoros": task_remaining(task),
    }


def board_stats(db: Session, settings: PomodoroSettings, tasks: list[PomodoroTask]) -> dict:
    today_start = datetime.combine(date.today(), datetime.min.time())
    work_sessions_today = (
        db.query(func.count(StudySession.id))
        .filter(StudySession.created_at >= today_start)
        .filter(StudySession.mode.in_(("focus", "pomodoro", "work")))
        .scalar()
        or 0
    )
    completed = sum(task.completed_pomodoros for task in tasks)
    remaining = sum(task_remaining(task) for task in tasks)
    estimated_finish_minutes = remaining * settings.work_minutes
    if remaining > 1:
        breaks = remaining - 1
        long_breaks = max(0, (breaks // max(1, settings.sessions_before_long_break)))
        short_breaks = breaks - long_breaks
        estimated_finish_minutes += short_breaks * settings.short_break_minutes + long_breaks * settings.long_break_minutes
    return {
        "work_sessions_today": int(work_sessions_today),
        "completed_pomodoros": completed,
        "remaining_pomodoros": remaining,
        "estimated_finish_minutes": estimated_finish_minutes,
        "active_task_id": settings.active_task_id,
    }


def pomodoro_board(db: Session) -> dict:
    settings = get_or_create_pomodoro_settings(db)
    tasks = list_tasks(db)
    return {
        "settings": serialize_settings(settings),
        "tasks": [serialize_task(task) for task in tasks],
        "stats": board_stats(db, settings, tasks),
    }


def create_task(db: Session, title: str, subject: str, estimated_pomodoros: int) -> PomodoroTask:
    max_sort = db.query(func.coalesce(func.max(PomodoroTask.sort_order), -1)).scalar() or -1
    task = PomodoroTask(
        title=title.strip(),
        subject=subject.strip() or "General",
        estimated_pomodoros=max(1, estimated_pomodoros),
        sort_order=max_sort + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task: PomodoroTask, data: dict) -> PomodoroTask:
    before_completed = task.completed
    for field in ("title", "subject", "estimated_pomodoros", "completed_pomodoros", "completed", "sort_order"):
        if field in data and data[field] is not None:
            setattr(task, field, data[field])
    task.estimated_pomodoros = max(1, task.estimated_pomodoros)
    task.completed_pomodoros = max(0, task.completed_pomodoros)
    if task.completed:
        task.completed_pomodoros = task.estimated_pomodoros
    if task.completed_pomodoros >= task.estimated_pomodoros:
        task.completed = True
        task.completed_pomodoros = task.estimated_pomodoros
    if task.completed and not before_completed:
        award_xp(db, 10, f"Completed pomodoro task: {task.title}", task.subject, "pomodoro_task", task.id)
    db.commit()
    db.refresh(task)
    return task


def advance_task(db: Session, task: PomodoroTask, amount: int = 1) -> PomodoroTask:
    task.completed_pomodoros = min(task.estimated_pomodoros, task.completed_pomodoros + max(1, amount))
    if task.completed_pomodoros >= task.estimated_pomodoros and not task.completed:
        task.completed = True
        award_xp(db, 10, f"Completed pomodoro task: {task.title}", task.subject, "pomodoro_task", task.id)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: PomodoroTask) -> None:
    db.delete(task)
    db.commit()


def set_active_task(db: Session, task_id: int | None) -> PomodoroSettings:
    settings = get_or_create_pomodoro_settings(db)
    settings.active_task_id = task_id
    db.commit()
    db.refresh(settings)
    return settings
