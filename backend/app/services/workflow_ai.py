from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.services.assistant_ai import memory_context_notes
from app.services.integrations import google_calendar_inventory, infer_calendar_subject, ticktick_inventory


def context_blob(user_context: dict[str, Any]) -> str:
    parts: list[str] = []
    parts.extend(user_context.get("study_windows", []))
    parts.extend(user_context.get("subject_focus", []))
    parts.extend(user_context.get("preferences", []))
    parts.extend(user_context.get("constraints", []))
    parts.extend(user_context.get("workflow_hints", []))
    parts.extend(user_context.get("topics", []))
    parts.extend(user_context.get("recent_notes", []))
    tone = user_context.get("tone")
    if tone:
        parts.append(str(tone))
    return " ".join(str(part) for part in parts if part).lower()


def context_has(user_context: dict[str, Any], *phrases: str) -> bool:
    blob = context_blob(user_context)
    return any(phrase.lower() in blob for phrase in phrases)


def workflow_hints(user_context: dict[str, Any]) -> list[str]:
    return [str(item).lower() for item in user_context.get("workflow_hints", [])]


def context_topics(user_context: dict[str, Any]) -> list[str]:
    return [str(item).lower() for item in user_context.get("topics", [])]


def analyze_workflow(db, settings: Settings) -> dict[str, Any]:
    ticktick = ticktick_inventory(db)
    google = google_calendar_inventory(settings, db)
    user_context = memory_context_notes(db)
    ticktick_tasks = flatten_ticktick_tasks(ticktick.get("projects", []))
    calendar_events = google.get("events", [])
    today = date.today()
    next_7_days = [today + timedelta(days=index) for index in range(7)]

    task_context = build_task_context(ticktick_tasks, today, user_context)
    calendar_context = build_calendar_context(calendar_events, next_7_days, user_context)
    plan = build_daily_plan(next_7_days, task_context, calendar_context, user_context)
    subject_scores = build_subject_scores(ticktick_tasks, calendar_events, user_context)
    recommendations = build_recommendations(task_context, calendar_context, subject_scores, user_context)
    next_session = build_next_session(task_context, calendar_context, subject_scores, user_context)
    ai_actions = build_ai_actions(task_context, calendar_context, subject_scores, user_context)
    data_quality = build_data_quality(task_context, calendar_context, user_context, ticktick, google)
    smart_defaults = build_smart_defaults(task_context, calendar_context, user_context)
    model_briefing = build_model_briefing(settings, task_context, calendar_context, subject_scores, user_context, next_session)

    return {
        "engine": "hybrid_workflow_ai" if model_briefing["model_used"] else "deterministic_workflow_ai",
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
            "memory_notes": user_context["total_memories"],
        },
        "task_priorities": task_context["priorities"],
        "calendar_load": calendar_context["days"],
        "subject_load": subject_scores,
        "recommendations": recommendations,
        "plan": plan,
        "best_mode_today": choose_best_mode(task_context, calendar_context, user_context),
        "next_session": next_session,
        "ai_actions": ai_actions,
        "data_quality": data_quality,
        "smart_defaults": smart_defaults,
        "model_briefing": model_briefing,
        "chatbot_prompts": build_chatbot_prompts(data_quality, user_context),
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
        "context_memory": user_context,
    }


def flatten_ticktick_tasks(projects: list[dict]) -> list[dict]:
    tasks: list[dict] = []
    for project in projects:
        for task in project.get("tasks", []):
            tasks.append({**task, "project_name": project.get("name", "TickTick")})
    return tasks


def build_task_context(tasks: list[dict], today: date, user_context: dict[str, Any]) -> dict[str, Any]:
    open_tasks = [task for task in tasks if task.get("status") != "completed"]
    overdue_tasks = [task for task in open_tasks if as_date(task.get("due_date")) and as_date(task.get("due_date")) < today]
    due_today = [task for task in open_tasks if as_date(task.get("due_date")) == today]
    due_next_7 = [task for task in open_tasks if as_date(task.get("due_date")) and today <= as_date(task.get("due_date")) <= today + timedelta(days=6)]
    unscheduled = [task for task in open_tasks if not task.get("due_date")]
    priorities = []
    for task in open_tasks:
        due = as_date(task.get("due_date"))
        days_until_due = (due - today).days if due else 999
        task_blob = " ".join(
            str(part)
            for part in [task.get("title"), task.get("project_name"), task.get("subject"), task.get("description"), task.get("content")]
            if part
        ).lower()
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
            if context_has(user_context, "organize_by_due_date", "prioritize_due_dates", "next 7 days", "next week"):
                priority_score += 12 if days_until_due <= 6 else 0
        priority_score += xp_hint(task) / 5
        if task.get("difficulty") == "boss":
            priority_score += 25
        if context_has(user_context, "prefer_short_sessions") and estimate_pomodoros(task) <= 1:
            priority_score += 8
        if context_has(user_context, "prefer_deep_work") and estimate_pomodoros(task) >= 2:
            priority_score += 6
        if context_has(user_context, "avoid_overload") and task.get("difficulty") == "boss":
            priority_score -= 5
        priority_score += context_subject_bonus(task.get("subject"), user_context)
        priority_score += context_topic_bonus(task_blob, user_context)
        if task.get("interpretation", {}).get("used_as") == "completed_xp":
            priority_score -= 5
        urgency = urgency_label(days_until_due, task.get("difficulty"))
        action = recommended_task_action(task, days_until_due, user_context)
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
                "reason": build_task_reason(task, days_until_due, user_context),
                "urgency": urgency,
                "recommended_action": action,
                "ai_tags": task_tags(task, task_blob, days_until_due, user_context),
                "target_feature": choose_task_feature(task, days_until_due),
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


def build_calendar_context(events: list[dict], days: list[date], user_context: dict[str, Any]) -> dict[str, Any]:
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
                "free_windows": prioritize_windows(free_windows, user_context),
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


def build_daily_plan(days: list[date], task_context: dict[str, Any], calendar_context: dict[str, Any], user_context: dict[str, Any]) -> list[dict]:
    planned_tasks = task_context["priorities"]
    plan: list[dict] = []
    for current_day in days:
        day_key = current_day.isoformat()
        day_row = next((row for row in calendar_context["days"] if row["date"] == day_key), None)
        free_windows = (day_row or {}).get("free_windows", [])
        free_minutes = sum(window["duration_minutes"] for window in free_windows)
        preferred_minutes = preferred_focus_minutes(user_context)
        if preferred_minutes and free_minutes:
            free_minutes = min(free_minutes, preferred_minutes)
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


def build_subject_scores(tasks: list[dict], events: list[dict], user_context: dict[str, Any]) -> list[dict]:
    scores: dict[str, dict[str, Any]] = defaultdict(lambda: {"subject": "", "task_count": 0, "event_count": 0, "xp": 0, "score": 0})
    for task in tasks:
        subject = task.get("subject") or "General"
        entry = scores[subject]
        entry["subject"] = subject
        entry["task_count"] += 1
        entry["xp"] += int(task.get("xp_reward") or 0)
        entry["score"] += int(task.get("xp_reward") or 0) + int(task.get("priority") or 0) * 4
        entry["score"] += context_subject_bonus(subject, user_context)
    for event in events:
        subject = event.get("subject") or infer_calendar_subject(event.get("title", ""), event.get("description", ""))
        entry = scores[subject]
        entry["subject"] = subject
        entry["event_count"] += 1
        interpretation = event.get("interpretation", {})
        entry["score"] += int(interpretation.get("xp_reward") or 0)
        entry["score"] += context_subject_bonus(subject, user_context)
    result = list(scores.values())
    result.sort(key=lambda item: item["score"], reverse=True)
    for item in result:
        item["score"] = round(float(item["score"]), 1)
    return result[:10]


def context_topic_bonus(task_blob: str, user_context: dict[str, Any]) -> int:
    if not task_blob:
        return 0
    lowered = task_blob.lower()
    bonus = 0
    for topic in user_context.get("topics", []):
        topic_text = str(topic).lower()
        if len(topic_text) >= 3 and topic_text in lowered:
            bonus += 6
    for phrase in user_context.get("recent_notes", []):
        phrase_text = str(phrase).lower()
        if len(phrase_text) >= 6 and phrase_text in lowered:
            bonus += 4
    return bonus


def build_recommendations(task_context: dict[str, Any], calendar_context: dict[str, Any], subject_scores: list[dict], user_context: dict[str, Any]) -> list[str]:
    notes = []
    if task_context["overdue_tasks"]:
        notes.append(f"Clear the {len(task_context['overdue_tasks'])} overdue TickTick tasks first. They are the highest drag on the workflow.")
    if task_context["due_today"]:
        notes.append(f"{len(task_context['due_today'])} TickTick tasks are due today, so keep them inside the first work block.")
    if task_context["unscheduled"]:
        notes.append(f"{len(task_context['unscheduled'])} open TickTick tasks have no due date. Add dates to make the queue more precise.")
    if context_has(user_context, "organize_by_due_date", "prioritize_due_dates", "next 7 days", "next week"):
        notes.append("The assistant will keep the next 7 days front and center so the queue stays split by date instead of becoming one large list.")
    if calendar_context["exam_events"]:
        notes.append("Exam or test events were detected in Calendar, so the app should favour boss-fight prep in the affected week.")
    if any(day["free_windows"] for day in calendar_context["days"]):
        notes.append("Use detected free windows for deep work, and keep study blocks protected from task drift.")
    if subject_scores:
        top_subject = subject_scores[0]
        notes.append(f"Your strongest current workflow cluster is {top_subject['subject']}, which should get the first deep work block.")
    if user_context["study_windows"]:
        notes.append(f"Use your preferred study window: {', '.join(user_context['study_windows'][:2])}.")
    if user_context["subject_focus"]:
        notes.append(f"Bias the plan toward your stated subjects: {', '.join(user_context['subject_focus'][:3])}.")
    if user_context["constraints"]:
        notes.append("Respect the user's stated constraints and keep the plan from getting noisy or overloaded.")
    if not notes:
        notes.append("No strong workflow pressure detected. Keep using Pomodoro mode to steadily convert tasks into progress.")
    return notes[:8]


def choose_best_mode(task_context: dict[str, Any], calendar_context: dict[str, Any], user_context: dict[str, Any]) -> dict[str, Any]:
    open_tasks = len(task_context["open_tasks"])
    overdue = len(task_context["overdue_tasks"])
    today_tasks = len(task_context["due_today"])
    free_windows = sum(len(day["free_windows"]) for day in calendar_context["days"])
    exam_events = len(calendar_context["exam_events"])
    if exam_events > 0 or overdue > 2:
        return {"name": "Boss prep", "reason": "Calendar exams or overdue tasks need concentrated prep.", "minutes": preferred_focus_minutes(user_context, 50)}
    if context_has(user_context, "calendar_first") and free_windows > 0:
        return {"name": "Calendar review", "reason": "The user's context says to work from the calendar first and protect the schedule.", "minutes": preferred_focus_minutes(user_context, 25)}
    if today_tasks > 0 and free_windows > 0:
        return {"name": "Pomodoro", "reason": "There are tasks due now and the calendar has usable focus windows.", "minutes": preferred_focus_minutes(user_context, 25)}
    if open_tasks > 8:
        return {"name": "Task sorting", "reason": "The queue is large enough that the app should keep the work pipeline broken into short sessions.", "minutes": preferred_focus_minutes(user_context, 25)}
    return {"name": "Deep work", "reason": "The week looks open enough for longer uninterrupted sessions.", "minutes": preferred_focus_minutes(user_context, 50)}


def pick_tasks_for_day(tasks: list[dict], current_day: date, free_minutes: int) -> list[dict]:
    day_tasks = []
    limit = 3 if free_minutes < 90 else 4
    for task in tasks:
        due = as_date(task.get("due_date"))
        if due is None:
            continue
        if due <= current_day and len(day_tasks) < limit:
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
    return day_tasks[:limit]


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


def build_next_session(task_context: dict[str, Any], calendar_context: dict[str, Any], subject_scores: list[dict], user_context: dict[str, Any]) -> dict[str, Any]:
    top_task = task_context["priorities"][0] if task_context["priorities"] else None
    first_window = None
    for day in calendar_context["days"]:
        if day["free_windows"]:
            first_window = {**day["free_windows"][0], "date": day["date"]}
            break
    subject = top_task.get("subject") if top_task else (subject_scores[0]["subject"] if subject_scores else "General")
    minutes = preferred_focus_minutes(user_context, 25 if top_task else 50)
    if first_window:
        minutes = min(minutes, max(25, int(first_window["duration_minutes"])))
    return {
        "title": top_task.get("title") if top_task else "Deep work block",
        "subject": subject or "General",
        "minutes": minutes,
        "mode": "boss_prep" if top_task and top_task.get("difficulty") == "boss" else ("deep_work" if minutes >= 45 else "pomodoro"),
        "source": top_task.get("source") if top_task else "calendar",
        "start": first_window.get("start") if first_window else None,
        "end": first_window.get("end") if first_window else None,
        "reason": top_task.get("reason") if top_task else "No urgent task was found, so the AI is reserving the next open block for mastery.",
    }


def build_ai_actions(task_context: dict[str, Any], calendar_context: dict[str, Any], subject_scores: list[dict], user_context: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    if task_context["overdue_tasks"]:
        actions.append({
            "surface": "Daily Quests",
            "title": "Clear overdue pressure",
            "body": f"{len(task_context['overdue_tasks'])} overdue TickTick tasks should stay at the top until cleared.",
            "priority": "high",
            "cta": "Open Daily Quests",
        })
    if task_context["unscheduled"]:
        actions.append({
            "surface": "TickTick",
            "title": "Add dates to unscheduled tasks",
            "body": f"{len(task_context['unscheduled'])} open tasks have no due date, so the next-7-days plan cannot place them accurately.",
            "priority": "medium",
            "cta": "Review TickTick",
        })
    if calendar_context["exam_events"]:
        actions.append({
            "surface": "Boss Fights",
            "title": "Turn exam events into prep fights",
            "body": "Calendar exam/test events should drive boss prep, timed challenges, and 200 XP completion.",
            "priority": "high",
            "cta": "Open Boss Fights",
        })
    if any(day["free_windows"] for day in calendar_context["days"]):
        actions.append({
            "surface": "Study Timer",
            "title": "Use the next free window",
            "body": "Calendar gaps are available, so the timer should be the fastest route into work.",
            "priority": "medium",
            "cta": "Lock in",
        })
    if subject_scores:
        top = subject_scores[0]
        actions.append({
            "surface": "Stats",
            "title": f"Push {top['subject']} mastery",
            "body": "This subject has the strongest combined load from tasks, events, XP, and context.",
            "priority": "low",
            "cta": "Open Stats",
        })
    if context_has(user_context, "avoid_overload"):
        actions.append({
            "surface": "Dashboard",
            "title": "Keep the board narrow",
            "body": "Your context says to avoid overload, so the UI should emphasize one next action.",
            "priority": "medium",
            "cta": "Dashboard",
        })
    return actions[:6]


def build_data_quality(task_context: dict[str, Any], calendar_context: dict[str, Any], user_context: dict[str, Any], ticktick: dict, google: dict) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    if not ticktick.get("connected"):
        warnings.append({"level": "warning", "title": "TickTick not live", "body": "Task analysis is using local cached or manual data until TickTick is connected."})
    if not google.get("connected"):
        warnings.append({"level": "warning", "title": "Calendar not live", "body": "Schedule analysis is limited until Google Calendar is connected."})
    if task_context["unscheduled"]:
        warnings.append({"level": "info", "title": "Unscheduled tasks", "body": "Add due dates in TickTick to make the next-7-days plan more accurate."})
    if user_context["total_memories"] < 3:
        warnings.append({"level": "info", "title": "Context is thin", "body": "Tell Context AI about subjects, study times, constraints, and task-order preferences."})
    if not any(day["free_windows"] for day in calendar_context["days"]):
        warnings.append({"level": "info", "title": "No free windows detected", "body": "Calendar is busy or unavailable, so the AI will rely more on task due dates."})
    return warnings[:5]


def build_smart_defaults(task_context: dict[str, Any], calendar_context: dict[str, Any], user_context: dict[str, Any]) -> dict[str, Any]:
    top_task = task_context["priorities"][0] if task_context["priorities"] else {}
    preferred_minutes = preferred_focus_minutes(user_context, 25)
    return {
        "quest_sort": "due_date" if context_has(user_context, "prioritize_due_dates", "organize_by_due_date") else "priority",
        "timer_minutes": preferred_minutes,
        "timer_mode": "deep_work" if preferred_minutes >= 45 else "pomodoro",
        "default_subject": top_task.get("subject") or (user_context.get("subject_focus") or ["General"])[0],
        "daily_goal_pressure": "high" if len(task_context["due_today"]) >= 3 else "normal",
        "show_boss_first": bool(calendar_context["exam_events"]),
    }


def build_chatbot_prompts(data_quality: list[dict[str, str]], user_context: dict[str, Any]) -> list[str]:
    prompts = []
    if user_context["total_memories"] < 3:
        prompts.append("What subjects matter most this week?")
        prompts.append("When do you usually focus best?")
    if any(item["title"] == "Unscheduled tasks" for item in data_quality):
        prompts.append("Should I keep undated tasks low priority?")
    if not user_context.get("timer_preference"):
        prompts.append("Do you prefer 25 or 50 minute blocks?")
    prompts.append("Should I sort work by due date, subject, or project?")
    return prompts[:4]


def build_model_briefing(settings: Settings, task_context: dict[str, Any], calendar_context: dict[str, Any], subject_scores: list[dict], user_context: dict[str, Any], next_session: dict[str, Any]) -> dict[str, Any]:
    fallback = {
        "model_used": False,
        "status": "rules_engine",
        "daily_brief": deterministic_daily_brief(task_context, calendar_context, next_session),
        "focus_rule": "Start with the highest priority dated task, then use the next calendar gap for one focused block.",
        "risks": [],
        "suggested_context_question": "What should I prioritize if tasks and calendar events conflict?",
    }
    if not settings.openai_api_key:
        return fallback
    payload = {
        "top_tasks": task_context["priorities"][:6],
        "calendar_days": calendar_context["days"][:7],
        "subject_scores": subject_scores[:5],
        "user_context": user_context,
        "next_session": next_session,
    }
    try:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"},
            json={
                "model": settings.openai_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a concise study workflow planner. Return JSON only with daily_brief, focus_rule, risks, suggested_context_question. Keep every string short.",
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "temperature": 0.2,
                "max_tokens": 220,
                "response_format": {"type": "json_object"},
            },
            timeout=12,
        )
        response.raise_for_status()
        content = (((response.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        parsed = json.loads(content)
        return {
            "model_used": True,
            "status": "openai",
            "daily_brief": str(parsed.get("daily_brief") or fallback["daily_brief"])[:320],
            "focus_rule": str(parsed.get("focus_rule") or fallback["focus_rule"])[:240],
            "risks": [str(item)[:160] for item in (parsed.get("risks") or [])][:4],
            "suggested_context_question": str(parsed.get("suggested_context_question") or fallback["suggested_context_question"])[:160],
        }
    except Exception as exc:
        return {**fallback, "status": f"rules_engine_model_error:{type(exc).__name__}"}


def deterministic_daily_brief(task_context: dict[str, Any], calendar_context: dict[str, Any], next_session: dict[str, Any]) -> str:
    if task_context["due_today"]:
        return f"Start with {len(task_context['due_today'])} due-today task(s), then protect {next_session['minutes']} minutes for {next_session['subject']}."
    if calendar_context["exam_events"]:
        return "Calendar exam pressure is active, so convert the next focus block into boss prep."
    return f"Use a {next_session['minutes']} minute {next_session['mode'].replace('_', ' ')} block for {next_session['subject']}."


def urgency_label(days_until_due: int, difficulty: str | None) -> str:
    if days_until_due < 0:
        return "overdue"
    if days_until_due == 0:
        return "today"
    if days_until_due <= 2:
        return "soon"
    if difficulty == "boss":
        return "boss"
    return "normal"


def recommended_task_action(task: dict, days_until_due: int, user_context: dict[str, Any]) -> str:
    if days_until_due < 0:
        return "Clear this first or reschedule it in TickTick."
    if task.get("difficulty") == "boss":
        return "Break this into boss-fight prep topics."
    if estimate_pomodoros(task) > 1 or context_has(user_context, "prefer_deep_work"):
        return "Schedule a focused timer block."
    return "Complete as a daily quest."


def task_tags(task: dict, task_blob: str, days_until_due: int, user_context: dict[str, Any]) -> list[str]:
    tags = []
    if days_until_due < 0:
        tags.append("overdue")
    elif days_until_due <= 6:
        tags.append("next_7_days")
    if task.get("difficulty"):
        tags.append(str(task["difficulty"]))
    if context_topic_bonus(task_blob, user_context):
        tags.append("matches_context")
    if task.get("project_name"):
        tags.append("project:" + str(task["project_name"])[:24])
    return tags[:5]


def choose_task_feature(task: dict, days_until_due: int) -> str:
    if task.get("difficulty") == "boss":
        return "Boss Fights"
    if estimate_pomodoros(task) >= 2:
        return "Study Timer"
    if days_until_due <= 6:
        return "Daily Quests"
    return "TickTick"


def context_subject_bonus(subject: str | None, user_context: dict[str, Any]) -> int:
    if not subject:
        return 0
    lowered = subject.lower()
    bonus = 0
    for focus in user_context["subject_focus"]:
        if focus.lower() in lowered:
            bonus += 18
    for preferred_window in user_context["study_windows"]:
        if preferred_window.lower() in lowered:
            bonus += 2
    for topic in user_context.get("topics", []):
        if str(topic).lower() in lowered:
            bonus += 6
    return bonus


def preferred_focus_minutes(user_context: dict[str, Any], fallback: int = 25) -> int:
    value = user_context.get("timer_preference")
    try:
        if value:
            return max(10, min(90, int(str(value).strip())))
    except Exception:
        pass
    if context_has(user_context, "prefer_deep_work"):
        return 50
    if context_has(user_context, "prefer_short_sessions", "quick blocks"):
        return 25
    return fallback


def prioritize_windows(windows: list[dict], user_context: dict[str, Any]) -> list[dict]:
    if not windows:
        return windows
    preferred = [window for window in windows if window_matches_context(window, user_context)]
    other = [window for window in windows if window not in preferred]
    if context_has(user_context, "calendar_first"):
        return preferred or windows
    return preferred + other


def window_matches_context(window: dict, user_context: dict[str, Any]) -> bool:
    start = parse_iso(window.get("start"))
    if not start:
        return False
    hour = start.hour
    if "night" in user_context["study_windows"] and hour >= 19:
        return True
    if "evening" in user_context["study_windows"] and 17 <= hour < 22:
        return True
    if "morning" in user_context["study_windows"] and 5 <= hour < 12:
        return True
    if "afternoon" in user_context["study_windows"] and 12 <= hour < 17:
        return True
    return False


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


def build_task_reason(task: dict, days_until_due: int, user_context: dict[str, Any] | None = None) -> str:
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
    if user_context and context_has(user_context, "next 7 days", "next week", "prioritize_due_dates"):
        return "The user wants a date-first queue, so this stays visible in the next 7 days."
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
