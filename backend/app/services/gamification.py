from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.entities import Achievement, BossFight, Mastery, Quest, StudySession, UserProfile, XpEvent

RANKS = [
    (0, "Seeker"),
    (500, "Scholar"),
    (1500, "Acharya"),
    (3000, "Mastery I"),
    (5000, "Mastery II"),
    (8000, "Mastery III"),
]

DIFFICULTY_XP = {"easy": 10, "medium": 30, "hard": 50, "boss": 200}

ACHIEVEMENT_CATALOG = [
    ("first_xp", "First Spark", "Earn XP for the first time."),
    ("quest_10", "Quest Chain", "Complete 10 quests."),
    ("session_5", "Focus Circle", "Log 5 study sessions."),
    ("streak_7", "Seven Day Flame", "Maintain a 7 day streak."),
    ("level_5", "Rising Scholar", "Reach level 5."),
    ("combo_5", "Flow State", "Complete five tasks in one combo."),
    ("boss_1", "Exam Slayer", "Clear your first boss fight."),
]


def level_for_xp(xp: int) -> dict:
    level = max(1, xp // 300 + 1)
    current_floor = (level - 1) * 300
    return {
        "level": level,
        "xp_into_level": xp - current_floor,
        "xp_for_next_level": 300,
        "rank_title": rank_for_xp(xp),
    }


def rank_for_xp(xp: int) -> str:
    title = RANKS[0][1]
    for threshold, rank in RANKS:
        if xp >= threshold:
            title = rank
    return title


def rank_progression(xp: int) -> list[dict]:
    return [{"threshold": threshold, "title": title, "unlocked": xp >= threshold} for threshold, title in RANKS]


def xp_for_difficulty(difficulty: str, fallback: int = 10) -> int:
    return DIFFICULTY_XP.get(difficulty, fallback)


def get_or_create_profile(db: Session) -> UserProfile:
    profile = db.get(UserProfile, 1)
    if profile:
        return profile
    profile = UserProfile(id=1, display_name="Scholar")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    seed_defaults(db)
    return profile


def seed_defaults(db: Session) -> None:
    if db.query(Quest).count() == 0:
        today = date.today()
        db.add_all(
            [
                Quest(title="Plan today's study route", subject="General", type="daily", difficulty="easy", xp_reward=10, due_date=today),
                Quest(title="Complete one 25 minute focus session", subject="General", type="daily", difficulty="medium", xp_reward=30, due_date=today),
                Quest(title="Review weak points before sleep", subject="General", type="daily", difficulty="easy", xp_reward=10, due_date=today),
                Quest(title="Weekly practice question sprint", subject="General", type="weekly", difficulty="hard", xp_reward=50, due_date=today + timedelta(days=5)),
            ]
        )
    db.commit()


def award_xp(db: Session, amount: int, reason: str, subject: str = "General", source_type: str = "manual", source_id: int | None = None) -> UserProfile:
    profile = get_or_create_profile(db)
    today = date.today()
    yesterday = today - timedelta(days=1)
    now = datetime.now()
    if profile.last_active_date != today:
        if profile.last_active_date == yesterday:
            profile.current_streak += 1
        else:
            profile.current_streak = 1
        profile.longest_streak = max(profile.longest_streak, profile.current_streak)
        profile.last_active_date = today

    if profile.last_completion_at and (now - profile.last_completion_at) <= timedelta(hours=6):
        profile.combo_count += 1
    else:
        profile.combo_count = 1
    profile.last_completion_at = now

    streak_bonus = 10 if profile.current_streak > 0 and profile.current_streak % 7 == 0 else 0
    combo_bonus = min(30, max(0, profile.combo_count - 1) * 5)
    total = amount + streak_bonus + combo_bonus
    profile.xp += total
    db.add(XpEvent(amount=total, reason=reason, subject=subject, source_type=source_type, source_id=source_id))

    mastery = db.query(Mastery).filter(Mastery.subject == subject).one_or_none()
    if not mastery:
        mastery = Mastery(subject=subject, points=0)
        db.add(mastery)
    mastery.points += max(1, amount // 10)

    unlock_achievements(db, profile)
    db.commit()
    db.refresh(profile)
    return profile


def unlock_achievements(db: Session, profile: UserProfile) -> None:
    completed_quests = db.query(Quest).filter(Quest.completed.is_(True)).count()
    completed_bosses = db.query(BossFight).filter(BossFight.completed.is_(True)).count()
    session_count = db.query(StudySession).count()
    candidates = [
        ("first_xp", "First Spark", "Earn XP for the first time.", profile.xp > 0),
        ("quest_10", "Quest Chain", "Complete 10 quests.", completed_quests >= 10),
        ("session_5", "Focus Circle", "Log 5 study sessions.", session_count >= 5),
        ("streak_7", "Seven Day Flame", "Maintain a 7 day streak.", profile.longest_streak >= 7),
        ("level_5", "Rising Scholar", "Reach level 5.", level_for_xp(profile.xp)["level"] >= 5),
        ("combo_5", "Flow State", "Complete five tasks in one combo.", profile.combo_count >= 5),
        ("boss_1", "Exam Slayer", "Clear your first boss fight.", completed_bosses >= 1),
    ]
    existing = {row.key for row in db.query(Achievement).all()}
    for key, title, description, unlocked in candidates:
        if unlocked and key not in existing:
            db.add(Achievement(key=key, title=title, description=description))


def locked_achievements(db: Session) -> list[dict]:
    unlocked = {row.key for row in db.query(Achievement).all()}
    return [
        {"key": key, "title": title, "description": description, "unlocked": key in unlocked}
        for key, title, description in ACHIEVEMENT_CATALOG
    ]


def session_xp(minutes: int, mode: str) -> int:
    if mode == "deep_work" or minutes >= 90:
        return 100
    if mode == "practice":
        return 50
    return max(10, (minutes // 25) * 30)


def heatmap(db: Session) -> list[dict]:
    rows = (
        db.query(func.date(XpEvent.created_at).label("day"), func.sum(XpEvent.amount).label("xp"))
        .group_by(func.date(XpEvent.created_at))
        .order_by(func.date(XpEvent.created_at))
        .all()
    )
    return [{"date": str(day), "xp": int(xp or 0)} for day, xp in rows]


def goal_progress(db: Session, profile: UserProfile) -> dict:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    today_start = datetime.combine(today, datetime.min.time())
    week_start_dt = datetime.combine(week_start, datetime.min.time())
    daily_xp = db.query(func.coalesce(func.sum(XpEvent.amount), 0)).filter(XpEvent.created_at >= today_start).scalar()
    weekly_xp = db.query(func.coalesce(func.sum(XpEvent.amount), 0)).filter(XpEvent.created_at >= week_start_dt).scalar()
    return {
        "daily_xp": int(daily_xp or 0),
        "daily_goal": profile.daily_xp_goal,
        "weekly_xp": int(weekly_xp or 0),
        "weekly_goal": profile.weekly_xp_goal,
    }
