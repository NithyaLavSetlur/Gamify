from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

from app.core.config import Settings
from app.services.integrations import google_calendar_inventory, infer_calendar_subject, ticktick_inventory


def analyze_workflow(db, settings: Settings) -> dict[str, Any]:
    ticktick = ticktick_inventory(db)
    google = google_calendar_inventory(settings, db)
    ticktick_tasks = flatten_ticktick_tasks(ticktick.get("projects", []))
    calendar_events = google.get("events", [])
    today = date.today()
    next_7_days = [today + timedelta(days=index) for index in range(7)]

    task_context = build_task_context(ticktick_tasks, today)
    calendar_context = build_calendar_context(calendar_events, next_7_days)
    plan = build_daily_plan(next_7_days, task_context, calendar_context)
    subject_scores = build_subject_scores(ticktick_tasks, calendar_events)
    recommendations = build_recommendations(task_context, calendar_context, subject_scores)

    return {
        "engine": "deterministic_workflow_ai",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "summary": {
            "connected": ticktick.get("connected", False) and google.get("connected", False),
            "ticktick_tasks": len(ticktick_tasks),
            "ticktick_open_tasks": len(task_context["open_tasks"]),
            "ticktick_overdue_tasks": len(task_context["overdue_tasks"]),
            "ticktick_due_today": len(task_context["due_today"]),
            "ticktick_due_next_7_days": len(task_context["due_next_7"]),
            "calendar_events": len(calendar_events),
            "study_blocks": len(calendar_context["study_blocks"]),
            "exam_events": len(calendar_context["exam_events"]),
            "free_windows": sum(len(day["free_windows"]) for day in calendar_context["days"]),
        },
        "task_priorities": task_context["priorities"],
        "calendar_load": calendar_context["days"],
        "subject_load": subject_scores,
        "recommendations": recommendations,
        "plan": plan,
        "best_mode_today": choose_best_mode(task_context, calendar_context),
        "task_to_feature_map": [
            {
                "feature": "Daily quests",
                "use": "Pull TickTick tasks due today or overdue into actionable quests.",
            },
            {
                "feature": "Pomodoro timer",
                "use": "Use for medium tasks and any work that fits into 25 to 50 minute blocks.",
            },
            {
                "feature": "Boss fights",
                "use": "Use calendar exam/test events to create deadline pressure and prep runs.",
            },
            {
                "feature": "Calendar view",
                "use": "Keep study blocks visible as protected focus time and schedule around free windows.",
            },
        ],
    }


def flatten_ticktick_tasks(projects: list[dict]) -> list[dict]:
    tasks: list[dict] = []
    for project in projects:
        for task in project.get("tasks", []):
            tasks.append({**task, "project_name": project.get("name", "TickTick")})
    return tasks


def build_task_context(tasks: list[dict], today: date) -> dict[str, Any]:
    open_tasks = [task for task in tasks if task.get("status") != "completed"]
    overdue_tasks = [task for task in open_tasks if as_date(task.get("due_date")) and as_date(task.get("due_date")) < today]
    due_today = [task for task in open_tasks if as_date(task.get("due_date")) == today]
    due_next_7 = [task for task in open_tasks if as_date(task.get("due_date")) and today <= as_date(task.get("due_date")) <= today + timedelta(days=6)]
    unscheduled = [task for task in open_tasks if not task.get("due_date")]
    priorities = []
    for task in open_tasks:
        due = as_date(task.get("due_date"))
        days_until_due = (due - today).days if due else 999
        priority_score = task.get("priority", 0) * 4
        if due is not None:
            if days_until_due < 0:
                priority_score += 80
            elif days_until_due == 0:
                priority_score += 60
            elif days_until_due <= 2:
                priority_score += 40
            elif days_until_due <= 6:
                priority_score += 20
        priority_score += xp_hint(task) / 5
        if task.get("difficulty") == "boss":
            priority_score += 25
        if task.get("interpretation", {}).get("used_as") == "completed_xp":
            priority_score -= 5
        priorities.append(
            {
                "id": task.get("id"),
                "title": task.get("title"),
                "project_name": task.get("project_name"),
                "subject": task.get("subject"),
                "due_date": task.get("due_date"),
                "difficulty": task.get("difficulty"),
                "xp_reward": task.get("xp_reward", 0),
                "priority_score": round(priority_score, 1),
                "estimated_pomodoros": estimate_pomodoros(task),
                "reason": build_task_reason(task, days_until_due),
                "source": "ticktick",
            }
        )
    priorities.sort(key=lambda item: item["priority_score"], reverse=True)
    return {
        "open_tasks": open_tasks,
        "overdue_tasks": overdue_tasks,
        "due_today": due_today,
        "due_next_7": due_next_7,
        "unscheduled": unscheduled,
        "priorities": priorities[:12],
    }


def build_calendar_context(events: list[dict], days: list[date]) -> dict[str, Any]:
    study_blocks = [event for event in events if event.get("is_study_block")]
    exam_events = [event for event in events if event.get("interpretation", {}).get("used_as") == "boss_fight"]
    daily_rows = []
    for current_day in days:
        day_events = [event for event in events if as_date(event.get("starts_at")) == current_day]
        day_events.sort(key=lambda event: event.get("starts_at", ""))
        free_windows = derive_free_windows(day_events, current_day)
        daily_rows.append(
            {
                "date": current_day.isoformat(),
                "events": [
                    {
                        "id": event.get("id"),
                        "title": event.get("title"),
                        "starts_at": event.get("starts_at"),
                        "ends_at": event.get("ends_at"),
                        "is_study_block": bool(event.get("is_study_block")),
                        "subject": event.get("subject"),
                        "used_as": event.get("interpretation", {}).get("used_as", "timeline"),
                    }
                    for event in day_events
                ],
                "free_windows": free_windows,
                "busy_minutes": sum(window["duration_minutes"] for window in day_events_windows(day_events)),
                "study_blocks": [event for event in day_events if event.get("is_study_block")],
                "exam_events": [event for event in day_events if event.get("interpretation", {}).get("used_as") == "boss_fight"],
            }
        )
    return {
        "study_blocks": study_blocks,
        "exam_events": exam_events,
        "days": daily_rows,
    }


def build_daily_plan(days: list[date], task_context: dict[str, Any], calendar_context: dict[str, Any]) -> list[dict]:
    planned_tasks = task_context["priorities"]
    plan: list[dict] = []
    for current_day in days:
        day_key = current_day.isoformat()
        day_row = next((row for row in calendar_context["days"] if row["date"] == day_key), None)
        free_minutes = sum(window["duration_minutes"] for window in (day_row or {}).get("free_windows", []))
        study_blocks = (day_row or {}).get("study_blocks", [])
        exam_events = (day_row or {}).get("exam_events", [])
        top_tasks = pick_tasks_for_day(planned_tasks, current_day, free_minutes)
        plan.append(
            {
                "date": day_key,
                "label": "Today" if current_day == date.today() else current_day.strftime("%a"),
                "focus_minutes": free_minutes,
                "study_blocks": len(study_blocks),
                "exam_events": len(exam_events),
                "top_tasks": top_tasks,
                "recommended_feature": choose_feature_for_day(top_tasks, free_minutes, exam_events),
            }
        )
    return plan


def build_subject_scores(tasks: list[dict], events: list[dict]) -> list[dict]:
    scores: dict[str, dict[str, Any]] = defaultdict(lambda: {"subject": "", "task_count": 0, "event_count": 0, "xp": 0, "score": 0})
    for task in tasks:
        subject = task.get("subject") or "General"
        entry = scores[subject]
        entry["subject"] = subject
        entry["task_count"] += 1
        entry["xp"] += int(task.get("xp_reward") or 0)
        entry["score"] += int(task.get("xp_reward") or 0) + int(task.get("priority") or 0) * 4
    for event in events:
        subject = event.get("subject") or infer_calendar_subject(event.get("title", ""), event.get("description", ""))
        entry = scores[subject]
        entry["subject"] = subject
        entry["event_count"] += 1
        interpretation = event.get("interpretation", {})
        entry["score"] += int(interpretation.get("xp_reward") or 0)
    result = list(scores.values())
    result.sort(key=lambda item: item["score"], reverse=True)
    for item in result:
        item["score"] = round(float(item["score"]), 1)
    return result[:10]


def build_recommendations(task_context: dict[str, Any], calendar_context: dict[str, Any], subject_scores: list[dict]) -> list[str]:
    notes = []
    if task_context["overdue_tasks"]:
        notes.append(f"Clear the {len(task_context['overdue_tasks'])} overdue TickTick tasks first. They are the highest drag on the workflow.")
    if task_context["due_today"]:
        notes.append(f"{len(task_context['due_today'])} TickTick tasks are due today, so keep them inside the first work block.")
    if task_context["unscheduled"]:
        notes.append(f"{len(task_context['unscheduled'])} open TickTick tasks have no due date. Add dates to make the queue more precise.")
    if calendar_context["exam_events"]:
        notes.append("Exam or test events were detected in Calendar, so the app should favour boss-fight prep in the affected week.")
    if any(day["free_windows"] for day in calendar_context["days"]):
        notes.append("Use detected free windows for deep work, and keep study blocks protected from task drift.")
    if subject_scores:
        top_subject = subject_scores[0]
        notes.append(f"Your strongest current workflow cluster is {top_subject['subject']}, which should get the first deep work block.")
    if not notes:
        notes.append("No strong workflow pressure detected. Keep using Pomodoro mode to steadily convert tasks into progress.")
    return notes[:8]


def choose_best_mode(task_context: dict[str, Any], calendar_context: dict[str, Any]) -> dict[str, Any]:
    open_tasks = len(task_context["open_tasks"])
    overdue = len(task_context["overdue_tasks"])
    today_tasks = len(task_context["due_today"])
    free_windows = sum(len(day["free_windows"]) for day in calendar_context["days"])
    exam_events = len(calendar_context["exam_events"])
    if exam_events > 0 or overdue > 2:
        return {"name": "Boss prep", "reason": "Calendar exams or overdue tasks need concentrated prep.", "minutes": 50}
    if today_tasks > 0 and free_windows > 0:
        return {"name": "Pomodoro", "reason": "There are tasks due now and the calendar has usable focus windows.", "minutes": 25}
    if open_tasks > 8:
        return {"name": "Task sorting", "reason": "The queue is large enough that the app should keep the work pipeline broken into short sessions.", "minutes": 25}
    return {"name": "Deep work", "reason": "The week looks open enough for longer uninterrupted sessions.", "minutes": 50}


def pick_tasks_for_day(tasks: list[dict], current_day: date, free_minutes: int) -> list[dict]:
    day_tasks = []
    for task in tasks:
        due = as_date(task.get("due_date"))
        if due is None:
            continue
        if due <= current_day and len(day_tasks) < 4:
            day_tasks.append(
                {
                    "title": task.get("title"),
                    "subject": task.get("subject"),
                    "difficulty": task.get("difficulty"),
                    "xp_reward": task.get("xp_reward"),
                    "estimated_pomodoros": estimate_pomodoros(task),
                    "reason": task.get("reason"),
                }
            )
    if not day_tasks and free_minutes > 0:
        for task in tasks[:2]:
            day_tasks.append(
                {
                    "title": task.get("title"),
                    "subject": task.get("subject"),
                    "difficulty": task.get("difficulty"),
                    "xp_reward": task.get("xp_reward"),
                    "estimated_pomodoros": estimate_pomodoros(task),
                    "reason": task.get("reason"),
                }
            )
    return day_tasks[:4]


def choose_feature_for_day(tasks: list[dict], free_minutes: int, exam_events: list[dict]) -> str:
    if exam_events:
        return "Boss fights"
    if free_minutes >= 90:
        return "Study timer"
    if tasks:
        if any(task.get("difficulty") == "hard" for task in tasks):
            return "Pomodoro board"
        return "Daily quests"
    return "Calendar view"


def derive_free_windows(events: list[dict], current_day: date) -> list[dict]:
    windows = []
    day_start = datetime.combine(current_day, time(7, 0))
    day_end = datetime.combine(current_day, time(22, 0))
    cursor = day_start
    for event in sorted(events, key=lambda event: event.get("starts_at", "")):
        start = parse_iso(event.get("starts_at"))
        end = parse_iso(event.get("ends_at"))
        if not start or not end:
            continue
        if start > cursor:
            duration = int((start - cursor).total_seconds() // 60)
            if duration >= 25:
                windows.append({"start": cursor.isoformat(), "end": start.isoformat(), "duration_minutes": duration})
        cursor = max(cursor, end)
    if cursor < day_end:
        duration = int((day_end - cursor).total_seconds() // 60)
        if duration >= 25:
            windows.append({"start": cursor.isoformat(), "end": day_end.isoformat(), "duration_minutes": duration})
    return windows


def day_events_windows(events: list[dict]) -> list[dict]:
    windows = []
    for event in events:
        start = parse_iso(event.get("starts_at"))
        end = parse_iso(event.get("ends_at"))
        if start and end:
            windows.append({"start": start.isoformat(), "end": end.isoformat(), "duration_minutes": int((end - start).total_seconds() // 60)})
    return windows


def estimate_pomodoros(task: dict) -> int:
    difficulty = task.get("difficulty")
    xp_reward = int(task.get("xp_reward") or 10)
    if difficulty == "boss":
        return max(4, round(xp_reward / 50))
    if difficulty == "hard":
        return max(2, round(xp_reward / 25))
    if difficulty == "medium":
        return max(1, round(xp_reward / 30))
    return 1


def xp_hint(task: dict) -> int:
    return int(task.get("xp_reward") or 0)


def build_task_reason(task: dict, days_until_due: int) -> str:
    if days_until_due < 0:
        return "Overdue, so it should be surfaced before anything else."
    if days_until_due == 0:
        return "Due today, so it belongs in the first work block."
    if days_until_due <= 2:
        return "Near-term deadline makes this a high priority task."
    if task.get("difficulty") == "boss":
        return "High complexity work should be split across multiple focused sessions."
    if task.get("interpretation", {}).get("used_as") == "completed_xp":
        return "Already completed in TickTick; keep it in history only."
    return "Standard upcoming task, suitable for the next open focus block."


def as_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except Exception:
        return None


def parse_iso(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None
