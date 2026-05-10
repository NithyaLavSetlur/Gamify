from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ProfileOut(BaseModel):
    id: int
    display_name: str
    xp: int
    current_streak: int
    longest_streak: int
    combo_count: int
    daily_xp_goal: int
    weekly_xp_goal: int
    streak_freezes: int
    shrivaishnava_mode: bool
    level: int
    xp_into_level: int
    xp_for_next_level: int
    rank_title: str


class QuestCreate(BaseModel):
    title: str
    description: str = ""
    subject: str = "General"
    type: str = "daily"
    difficulty: str = "easy"
    xp_reward: int = 10
    due_date: date | None = None


class QuestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    subject: str
    type: str
    difficulty: str
    xp_reward: int
    due_date: date | None
    completed: bool
    external_source: str | None


class StudySessionCreate(BaseModel):
    subject: str = "General"
    mode: str = "focus"
    minutes: int
    notes: str = ""


class StudySessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    mode: str
    minutes: int
    xp_awarded: int
    notes: str
    created_at: datetime


class PomodoroSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    work_minutes: int
    short_break_minutes: int
    long_break_minutes: int
    sessions_before_long_break: int
    auto_start_breaks: bool
    auto_start_pomodoros: bool
    sound_enabled: bool
    active_task_id: int | None


class PomodoroSettingsUpdate(BaseModel):
    work_minutes: int | None = None
    short_break_minutes: int | None = None
    long_break_minutes: int | None = None
    sessions_before_long_break: int | None = None
    auto_start_breaks: bool | None = None
    auto_start_pomodoros: bool | None = None
    sound_enabled: bool | None = None
    active_task_id: int | None = None


class PomodoroTaskCreate(BaseModel):
    title: str
    subject: str = "General"
    estimated_pomodoros: int = 1


class PomodoroTaskUpdate(BaseModel):
    title: str | None = None
    subject: str | None = None
    estimated_pomodoros: int | None = None
    completed_pomodoros: int | None = None
    completed: bool | None = None
    sort_order: int | None = None


class PomodoroTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    subject: str
    estimated_pomodoros: int
    completed_pomodoros: int
    completed: bool
    sort_order: int
    remaining_pomodoros: int


class PomodoroBoardOut(BaseModel):
    settings: PomodoroSettingsOut
    tasks: list[PomodoroTaskOut]
    stats: dict


class BossFightCreate(BaseModel):
    subject: str
    title: str
    exam_date: date | None = None
    duration_minutes: int = 60
    difficulty: str = "boss"
    topics: list[str] = []


class BossFightOut(BaseModel):
    id: int
    subject: str
    title: str
    exam_date: date | None
    duration_minutes: int
    difficulty: str
    topics: list[str]
    completed: bool
    xp_awarded: int


class CalendarEventCreate(BaseModel):
    title: str
    starts_at: datetime
    ends_at: datetime


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    starts_at: datetime
    ends_at: datetime
    is_study_block: bool
    external_source: str | None


class SettingsUpdate(BaseModel):
    display_name: str | None = None
    shrivaishnava_mode: bool | None = None
    daily_xp_goal: int | None = None
    weekly_xp_goal: int | None = None


class DashboardOut(BaseModel):
    profile: ProfileOut
    quests: list[QuestOut]
    sessions: list[StudySessionOut]
    pomodoro: PomodoroBoardOut
    bosses: list[BossFightOut]
    events: list[CalendarEventOut]
    achievements: list[dict]
    mastery: list[dict]
    heatmap: list[dict]
    integrations: dict
    goals: dict
    ranks: list[dict]
    locked_achievements: list[dict]
    quote: dict
