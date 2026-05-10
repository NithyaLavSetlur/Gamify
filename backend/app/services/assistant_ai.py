from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
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

WORKFLOW_HINTS = {
    "next 7 days": ("workflow_hint", "organize_by_due_date"),
    "next week": ("workflow_hint", "organize_by_due_date"),
    "due date": ("workflow_hint", "prioritize_due_dates"),
    "sort by date": ("workflow_hint", "prioritize_due_dates"),
    "sorted by due date": ("workflow_hint", "prioritize_due_dates"),
    "group by project": ("workflow_hint", "group_by_project"),
    "group by subject": ("workflow_hint", "group_by_subject"),
    "calendar first": ("workflow_hint", "calendar_first"),
    "tasks first": ("workflow_hint", "tasks_first"),
    "one at a time": ("workflow_hint", "avoid_overload"),
    "less clutter": ("workflow_hint", "avoid_overload"),
    "no overload": ("workflow_hint", "avoid_overload"),
    "short sessions": ("workflow_hint", "prefer_short_sessions"),
    "quick blocks": ("workflow_hint", "prefer_short_sessions"),
    "deep work": ("workflow_hint", "prefer_deep_work"),
    "calm": ("tone", "calm"),
    "minimal": ("tone", "minimal"),
    "structured": ("tone", "structured"),
    "strict": ("tone", "structured"),
    "ticktick": ("integration_focus", "ticktick"),
    "calendar": ("integration_focus", "calendar"),
}

TIME_WINDOW_HINTS = {
    "after school": "after_school",
    "after work": "after_work",
    "before class": "before_class",
    "during lunch": "lunch",
    "weekdays": "weekdays",
    "weekends": "weekends",
}

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "will",
    "want",
    "need",
    "what",
    "when",
    "where",
    "why",
    "how",
    "about",
    "into",
    "your",
    "you",
    "are",
    "was",
    "were",
    "i",
    "me",
    "my",
    "we",
    "our",
    "they",
    "them",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "be",
    "is",
    "it",
    "as",
    "or",
    "not",
    "do",
    "dont",
    "don't",
    "please",
    "make",
    "use",
    "should",
    "could",
    "would",
    "some",
    "more",
    "less",
    "just",
    "really",
    "basically",
    "whatever",
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
    cleaned = normalize_text(message)
    user_message = AssistantMessage(role="user", content=cleaned)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    extracted = extract_memories(cleaned)
    for item in extracted["memories"]:
        upsert_memory(db, item["category"], item["key"], item["value"], item["weight"], user_message.id)

    summary = summarize_memories(db.query(AssistantMemory).all())
    pending_question = pick_follow_up_question(cleaned, extracted["memories"])
    ai_reply = generate_ai_reply(cleaned, summary, pending_question)
    if ai_reply:
        reply = ai_reply["reply"]
        pending_question = ai_reply["follow_up_question"] or pending_question
        needs_follow_up = bool(ai_reply["needs_follow_up"])
    elif pending_question:
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
        "summary": summary,
    }


def extract_memories(text: str) -> dict[str, list[dict[str, Any]]]:
    cleaned = normalize_text(text)
    lower = cleaned.lower()
    memories: list[dict[str, Any]] = []

    if cleaned:
        memories.append({"category": "raw_note", "key": "message", "value": cleaned, "weight": 1})

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
        (r"\bi prefer ([^.!,\n]+) sessions\b", "preference", "session_style", 3),
        (r"\bi want ([^.!,\n]+) to be prioritized\b", "preference", "priority_rule", 3),
    ]

    for pattern, category, key, weight in explicit_patterns:
        match = re.search(pattern, lower, flags=re.IGNORECASE)
        if match:
            value = normalize_phrase(match.group(1))
            if value:
                memories.append({"category": category, "key": key, "value": value, "weight": weight})

    for keyword, (category, value) in KEYWORD_HINTS.items():
        if keyword in lower:
            memories.append({"category": category, "key": keyword, "value": value, "weight": 1})

    for keyword, (category, value) in WORKFLOW_HINTS.items():
        if keyword in lower:
            memories.append({"category": category, "key": keyword, "value": value, "weight": 2})

    for keyword, value in TIME_WINDOW_HINTS.items():
        if keyword in lower:
            memories.append({"category": "study_window", "key": keyword, "value": value, "weight": 2})

    if any(phrase in lower for phrase in ("don't suggest", "do not suggest", "avoid", "never", "no ", "not ")):
        memories.append({"category": "constraint", "key": "negative_preference", "value": cleaned, "weight": 2})

    memories.extend(extract_topics(cleaned))

    if "remember" in lower and len(memories) == 1:
        memories.append({"category": "note", "key": "general_note", "value": cleaned, "weight": 1})

    return {"memories": dedupe_memories(memories)}


def extract_topics(text: str) -> list[dict[str, Any]]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9'\-]{2,}", text.lower())
    filtered = [word for word in words if word not in STOPWORDS and not word.isdigit()]
    if not filtered:
        return []

    counts = Counter(filtered)
    common = counts.most_common(6)
    topics: list[dict[str, Any]] = []
    for word, weight in common:
        if len(word) < 4 and word not in {"ai", "ux", "api"}:
            continue
        topics.append({"category": "topic", "key": word, "value": word, "weight": max(1, min(3, weight))})

    phrase_hits = [
        phrase.strip()
        for phrase in re.findall(r"(?:about|for|with|on|regarding|around|focus on|prioritize|prioritise)\s+([^.!,;\n]+)", text, flags=re.IGNORECASE)
    ]
    for phrase in phrase_hits:
        normalized = normalize_phrase(phrase)
        if normalized and len(normalized.split()) <= 5:
            topics.append({"category": "context_phrase", "key": normalized, "value": normalized, "weight": 2})
    return dedupe_memories(topics)


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


def generate_ai_reply(message: str, summary: dict[str, Any], pending_question: str | None) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    system_prompt = (
        "You are Context AI inside a study productivity app. "
        "Your job is to be a tiny, practical chatbot that learns user context. "
        "Reply in 1-2 short sentences, max 24 words total. "
        "Be normal, calm, and direct. "
        "If you need more detail, ask one short question. "
        "If the user is giving context, acknowledge it briefly. "
        "Never be verbose."
    )
    user_prompt = {
        "message": message,
        "known_context": summary.get("context_map", {}),
        "pending_question": pending_question,
        "response_rules": {
            "max_words": 24,
            "if_context": "acknowledge briefly and state how it will be used",
            "if_unclear": "ask one concise follow-up question",
        },
    }
    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=True)},
        ],
        "temperature": 0.2,
        "max_tokens": 80,
    }
    try:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        if not content:
            return None
        parsed = parse_ai_response(content)
        if parsed:
            return parsed
        return {"reply": content[:240], "needs_follow_up": False, "follow_up_question": None}
    except Exception:
        return None


def parse_ai_response(content: str) -> dict[str, Any] | None:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
    try:
        parsed = json.loads(text)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    reply = str(parsed.get("reply") or "").strip()
    if not reply:
        return None
    return {
        "reply": reply[:240],
        "needs_follow_up": bool(parsed.get("needs_follow_up")),
        "follow_up_question": (str(parsed.get("follow_up_question")).strip() or None),
    }


def acknowledgement(memories: list[dict[str, Any]], message: str) -> str:
    if not memories:
        return "ok understood!"
    summary = brief_memory_summary(memories)
    if summary:
        return f"ok understood! I'll use {summary} when I analyse your study workflow."
    return "ok understood! I'll use that context when I analyse your study workflow."


def pick_follow_up_question(message: str, memories: list[dict[str, Any]]) -> str | None:
    lower = message.lower()
    has_subject = any(item["category"] == "subject_focus" for item in memories)
    has_window = any(item["category"] == "study_window" for item in memories)
    has_timer = any(item["category"] == "timer_preference" for item in memories)
    has_workflow_hint = any(item["category"] == "workflow_hint" for item in memories)

    if ("exam" in lower or "test" in lower) and not has_subject:
        return "Which subject or exam should I prioritize first?"
    if ("study" in lower or "workflow" in lower or "schedule" in lower or "time" in lower) and not has_window:
        return "What time of day do you usually focus best?"
    if ("pomodoro" in lower or "timer" in lower) and not has_timer:
        return "What timer length do you want me to treat as your default?"
    if ("sort" in lower or "group" in lower or "prioritize" in lower) and not has_workflow_hint:
        return "Should I sort your workflow by due date, subject, or project?"
    if "more context" in lower or "remember" in lower:
        return None
    if not memories and len(lower.split()) < 8:
        return "What should I pay most attention to: subjects, timing, task order, or tone?"
    return None


def summarize_memories(memories: list[AssistantMemory]) -> dict[str, Any]:
    summary = {
        "total_memories": len(memories),
        "study_windows": [],
        "subject_focus": [],
        "timer_preference": None,
        "preferences": [],
        "constraints": [],
        "workflow_hints": [],
        "topics": [],
        "recent_notes": [],
        "tone": None,
        "context_map": {
            "study_windows": [],
            "subject_focus": [],
            "workflow_hints": [],
            "preferences": [],
            "constraints": [],
            "topics": [],
            "recent_notes": [],
            "tone": None,
        },
    }
    for memory in memories:
        if memory.category == "study_window":
            summary["study_windows"].append(memory.value)
            summary["context_map"]["study_windows"].append(memory.value)
        elif memory.category == "subject_focus":
            summary["subject_focus"].append(memory.value)
            summary["context_map"]["subject_focus"].append(memory.value)
        elif memory.category == "timer_preference" and summary["timer_preference"] is None:
            summary["timer_preference"] = memory.value
        elif memory.category == "workflow_hint":
            summary["workflow_hints"].append(memory.value)
            summary["context_map"]["workflow_hints"].append(memory.value)
        elif memory.category == "constraint":
            summary["constraints"].append(memory.value)
            summary["context_map"]["constraints"].append(memory.value)
        elif memory.category in {"topic", "context_phrase"}:
            summary["topics"].append(memory.value)
            summary["context_map"]["topics"].append(memory.value)
        elif memory.category == "tone":
            if summary["tone"] is None:
                summary["tone"] = memory.value
                summary["context_map"]["tone"] = memory.value
        elif memory.category == "raw_note":
            if len(summary["recent_notes"]) < 5:
                summary["recent_notes"].append(memory.value)
                summary["context_map"]["recent_notes"].append(memory.value)
        else:
            summary["preferences"].append(memory.value)
            summary["context_map"]["preferences"].append(memory.value)
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
        elif item["category"] == "workflow_hint":
            parts.append(str(item["value"]).replace("_", " "))
        elif item["category"] == "constraint":
            parts.append("your constraints")
        elif item["category"] == "tone":
            parts.append(f"{item['value']} tone")
    return ", ".join(parts)


def memory_context_notes(db: Session) -> dict[str, Any]:
    memories = db.query(AssistantMemory).order_by(AssistantMemory.weight.desc(), AssistantMemory.updated_at.desc()).all()
    return summarize_memories(memories)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_phrase(text: str) -> str:
    phrase = normalize_text(text.lower())
    phrase = re.sub(r"[^a-z0-9\s'\-]", "", phrase)
    return phrase.strip()
