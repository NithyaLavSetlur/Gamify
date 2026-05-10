from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AssistantMemory, AssistantMessage


KEYWORD_HINTS = {
    "night": ("study_window", "night"),
    "evening": ("study_window", "evening"),
    "morning": ("study_window", "morning"),
    "afternoon": ("study_window", "afternoon"),
    "math": ("subject_focus", "Math"),
    "physics": ("subject_focus", "Physics"),
    "chemistry": ("subject_focus", "Chemistry"),
    "biology": ("subject_focus", "Biology"),
    "english": ("subject_focus", "English"),
    "history": ("subject_focus", "History"),
    "coding": ("subject_focus", "Coding"),
    "programming": ("subject_focus", "Programming"),
    "exam": ("deadline_focus", "exam"),
    "test": ("deadline_focus", "test"),
    "revision": ("study_style", "revision"),
    "practice": ("study_style", "practice"),
    "pomodoro": ("timer_style", "pomodoro"),
    "25": ("timer_preference", "25"),
    "50": ("timer_preference", "50"),
}


def load_assistant_state(db: Session) -> dict[str, Any]:
    messages = db.query(AssistantMessage).order_by(AssistantMessage.created_at.desc()).limit(24).all()
    memories = db.query(AssistantMemory).order_by(AssistantMemory.weight.desc(), AssistantMemory.updated_at.desc()).limit(24).all()
    return {
        "messages": list(reversed(messages)),
        "memories": list(reversed(memories)),
        "summary": summarize_memories(memories),
    }


def process_message(db: Session, message: str) -> dict[str, Any]:
    cleaned = message.strip()
    user_message = AssistantMessage(role="user", content=cleaned)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    extracted = extract_memories(cleaned)
    for item in extracted["memories"]:
        upsert_memory(db, item["category"], item["key"], item["value"], item["weight"], user_message.id)

    pending_question = pick_follow_up_question(cleaned, extracted["memories"])
    if pending_question:
        reply = pending_question
        needs_follow_up = True
    else:
        reply = acknowledgement(extracted["memories"], cleaned)
        needs_follow_up = False

    assistant_message = AssistantMessage(role="assistant", content=reply)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return {
        "message": assistant_message,
        "needs_follow_up": needs_follow_up,
        "follow_up_question": pending_question,
        "memories_added": extracted["memories"],
        "summary": summarize_memories(db.query(AssistantMemory).all()),
    }


def extract_memories(text: str) -> dict[str, list[dict[str, Any]]]:
    lower = text.lower()
    memories: list[dict[str, Any]] = []

    explicit_patterns = [
        (r"\bmy name is ([^.!,\n]+)", "profile", "name", 3),
        (r"\bi study best (?:at|in) ([^.!,\n]+)", "study_window", "preferred_window", 4),
        (r"\bi work best (?:at|in) ([^.!,\n]+)", "study_window", "preferred_window", 4),
        (r"\bi prefer ([^.!,\n]+)", "preference", "preference", 2),
        (r"\bmy strongest subject is ([^.!,\n]+)", "subject_focus", "strong_subject", 4),
        (r"\bmy weak subject is ([^.!,\n]+)", "subject_focus", "weak_subject", 4),
        (r"\bmy exam is on ([^.!,\n]+)", "deadline_focus", "exam_date", 4),
        (r"\bmy exam is ([^.!,\n]+)", "deadline_focus", "exam_date", 4),
        (r"\buse (\d{1,3}) minute blocks\b", "timer_preference", "work_minutes", 4),
        (r"\bi like (\d{1,3}) minute pomodoros\b", "timer_preference", "work_minutes", 4),
    ]

    for pattern, category, key, weight in explicit_patterns:
        match = re.search(pattern, lower, flags=re.IGNORECASE)
        if match:
            value = match.group(1).strip()
            memories.append({"category": category, "key": key, "value": value, "weight": weight})

    for keyword, (category, value) in KEYWORD_HINTS.items():
        if keyword in lower:
            memories.append({"category": category, "key": keyword, "value": value, "weight": 1})

    if "don't suggest" in lower or "do not suggest" in lower:
        memories.append({"category": "preference", "key": "avoid_suggestion", "value": text.strip(), "weight": 2})

    if "remember" in lower and not memories:
        memories.append({"category": "note", "key": "general_note", "value": text.strip(), "weight": 1})

    return {"memories": dedupe_memories(memories)}


def dedupe_memories(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        key = (item["category"], item["key"], str(item["value"]).lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def upsert_memory(db: Session, category: str, key: str, value: str, weight: int, source_message_id: int) -> AssistantMemory:
    existing = (
        db.query(AssistantMemory)
        .filter(AssistantMemory.category == category, AssistantMemory.key == key, AssistantMemory.value == value)
        .one_or_none()
    )
    if existing:
        existing.weight = max(existing.weight, weight)
        existing.source_message_id = source_message_id
        db.commit()
        db.refresh(existing)
        return existing
    memory = AssistantMemory(category=category, key=key, value=value, weight=weight, source_message_id=source_message_id)
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


def acknowledgement(memories: list[dict[str, Any]], message: str) -> str:
    if not memories:
        return "ok understood!"
    summary = brief_memory_summary(memories)
    if summary:
        return f"ok understood! I’ll use {summary} when I analyse your study workflow."
    return "ok understood!"


def pick_follow_up_question(message: str, memories: list[dict[str, Any]]) -> str | None:
    lower = message.lower()
    has_subject = any(item["category"] == "subject_focus" for item in memories)
    has_window = any(item["category"] == "study_window" for item in memories)
    has_timer = any(item["category"] == "timer_preference" for item in memories)

    if ("exam" in lower or "test" in lower) and not has_subject:
        return "Which subject or exam should I prioritize first?"
    if ("study" in lower or "workflow" in lower or "schedule" in lower) and not has_window:
        return "What time of day do you usually focus best?"
    if ("pomodoro" in lower or "timer" in lower) and not has_timer:
        return "What timer length do you want me to treat as your default?"
    if "more context" in lower or "remember" in lower:
        return None
    if not memories and len(lower.split()) < 5:
        return "Can you tell me a bit more about what should matter most?"
    return None


def summarize_memories(memories: list[AssistantMemory]) -> dict[str, Any]:
    summary = {
        "total_memories": len(memories),
        "study_windows": [],
        "subject_focus": [],
        "timer_preference": None,
        "preferences": [],
    }
    for memory in memories:
        if memory.category == "study_window":
            summary["study_windows"].append(memory.value)
        elif memory.category == "subject_focus":
            summary["subject_focus"].append(memory.value)
        elif memory.category == "timer_preference" and summary["timer_preference"] is None:
            summary["timer_preference"] = memory.value
        else:
            summary["preferences"].append(memory.value)
    return summary


def brief_memory_summary(memories: list[dict[str, Any]]) -> str:
    parts = []
    for item in memories[:3]:
        if item["category"] == "study_window":
            parts.append(f"your {item['value']} focus window")
        elif item["category"] == "subject_focus":
            parts.append(f"{item['value']} focus")
        elif item["category"] == "timer_preference":
            parts.append(f"{item['value']} minute blocks")
        else:
            parts.append(str(item["value"]))
    return ", ".join(parts)


def memory_context_notes(db: Session) -> dict[str, Any]:
    memories = db.query(AssistantMemory).order_by(AssistantMemory.weight.desc(), AssistantMemory.updated_at.desc()).all()
    return summarize_memories(memories)

