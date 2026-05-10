from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), default="Scholar")
    xp: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    combo_count: Mapped[int] = mapped_column(Integer, default=0)
    daily_xp_goal: Mapped[int] = mapped_column(Integer, default=150)
    weekly_xp_goal: Mapped[int] = mapped_column(Integer, default=750)
    streak_freezes: Mapped[int] = mapped_column(Integer, default=1)
    last_active_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_completion_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shrivaishnava_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    lock_media_url: Mapped[str] = mapped_column(Text, default="")
    lock_media_position: Mapped[str] = mapped_column(String(20), default="right")
    lock_show_timer: Mapped[bool] = mapped_column(Boolean, default=True)
    lock_show_stats: Mapped[bool] = mapped_column(Boolean, default=True)
    lock_show_tasks: Mapped[bool] = mapped_column(Boolean, default=True)
    lock_show_quote: Mapped[bool] = mapped_column(Boolean, default=True)
    ticktick_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    google_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(80), default="General")
    type: Mapped[str] = mapped_column(String(30), default="daily")
    difficulty: Mapped[str] = mapped_column(String(20), default="easy")
    xp_reward: Mapped[int] = mapped_column(Integer, default=10)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(80), default="General")
    mode: Mapped[str] = mapped_column(String(40), default="focus")
    minutes: Mapped[int] = mapped_column(Integer)
    xp_awarded: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AssistantMemory(Base):
    __tablename__ = "assistant_memories"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(40), default="note")
    key: Mapped[str] = mapped_column(String(80))
    value: Mapped[str] = mapped_column(Text)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    source_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class PomodoroSettings(Base):
    __tablename__ = "pomodoro_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    work_minutes: Mapped[int] = mapped_column(Integer, default=25)
    short_break_minutes: Mapped[int] = mapped_column(Integer, default=5)
    long_break_minutes: Mapped[int] = mapped_column(Integer, default=15)
    sessions_before_long_break: Mapped[int] = mapped_column(Integer, default=4)
    auto_start_breaks: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_start_pomodoros: Mapped[bool] = mapped_column(Boolean, default=False)
    sound_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    active_task_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class PomodoroTask(Base):
    __tablename__ = "pomodoro_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(180))
    subject: Mapped[str] = mapped_column(String(80), default="General")
    estimated_pomodoros: Mapped[int] = mapped_column(Integer, default=1)
    completed_pomodoros: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class BossFight(Base):
    __tablename__ = "boss_fights"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    exam_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    difficulty: Mapped[str] = mapped_column(String(20), default="boss")
    topics: Mapped[str] = mapped_column(Text, default="")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(180))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    is_study_block: Mapped[bool] = mapped_column(Boolean, default=False)
    external_source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Mastery(Base):
    __tablename__ = "mastery"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(80), unique=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class XpEvent(Base):
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(80), default="General")
    source_type: Mapped[str] = mapped_column(String(40), default="manual")
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class IntegrationToken(Base):
    __tablename__ = "integration_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), unique=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scope: Mapped[str] = mapped_column(Text, default="")
    token_type: Mapped[str] = mapped_column(String(40), default="Bearer")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
