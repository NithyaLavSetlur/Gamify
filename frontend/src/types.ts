export type Profile = {
  id: number;
  display_name: string;
  xp: number;
  current_streak: number;
  longest_streak: number;
  combo_count: number;
  daily_xp_goal: number;
  weekly_xp_goal: number;
  streak_freezes: number;
  shrivaishnava_mode: boolean;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number;
  rank_title: string;
};

export type Quest = {
  id: number;
  title: string;
  description: string;
  subject: string;
  type: "daily" | "weekly" | string;
  difficulty: "easy" | "medium" | "hard" | "boss" | string;
  xp_reward: number;
  due_date: string | null;
  completed: boolean;
  external_source: string | null;
};

export type StudySession = {
  id: number;
  subject: string;
  mode: string;
  minutes: number;
  xp_awarded: number;
  notes: string;
  created_at: string;
};

export type PomodoroSettings = {
  id: number;
  work_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  sessions_before_long_break: number;
  auto_start_breaks: boolean;
  auto_start_pomodoros: boolean;
  sound_enabled: boolean;
  active_task_id: number | null;
};

export type PomodoroTask = {
  id: number;
  title: string;
  subject: string;
  estimated_pomodoros: number;
  completed_pomodoros: number;
  completed: boolean;
  sort_order: number;
  remaining_pomodoros: number;
};

export type PomodoroBoard = {
  settings: PomodoroSettings;
  tasks: PomodoroTask[];
  stats: {
    work_sessions_today: number;
    completed_pomodoros: number;
    remaining_pomodoros: number;
    estimated_finish_minutes: number;
    active_task_id: number | null;
  };
};

export type BossFight = {
  id: number;
  subject: string;
  title: string;
  exam_date: string | null;
  duration_minutes: number;
  difficulty: "easy" | "medium" | "hard" | "boss" | string;
  topics: string[];
  completed: boolean;
  xp_awarded: number;
};

export type CalendarEvent = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  is_study_block: boolean;
  external_source: string | null;
};

export type DashboardState = {
  profile: Profile;
  quests: Quest[];
  sessions: StudySession[];
  pomodoro: PomodoroBoard;
  bosses: BossFight[];
  events: CalendarEvent[];
  achievements: Array<{ key: string; title: string; description: string; unlocked_at: string }>;
  mastery: Array<{ subject: string; points: number }>;
  heatmap: Array<{ date: string; xp: number }>;
  integrations: Record<string, IntegrationStatus>;
  goals: {
    daily_xp: number;
    daily_goal: number;
    weekly_xp: number;
    weekly_goal: number;
  };
  ranks: Array<{ threshold: number; title: string; unlocked: boolean }>;
  locked_achievements: Array<{ key: string; title: string; description: string; unlocked: boolean }>;
  quote: { title: string; body: string };
};

export type IntegrationStatus = {
  provider: string;
  configured: boolean;
  connected: boolean;
  auth_url: string | null;
  manual_fallback: boolean;
};

export type DeploymentConfig = {
  backend_url: string;
  frontend_url: string;
  ticktick_redirect_uri: string;
  google_redirect_uri: string;
  ticktick_credentials_configured: boolean;
  google_credentials_configured: boolean;
};

export type IntegrationIntelligence = {
  summary: {
    imported_quests: number;
    study_events: number;
    boss_fights: number;
    open_ticktick_tasks: number;
    google_study_blocks: number;
  };
  rules: string[];
  ticktick: {
    connected: boolean;
    source: string;
    projects: Array<{
      id: string;
      name: string;
      total: number;
      open: number;
      completed: number;
      tasks: IntegrationTask[];
    }>;
    generated_quests: IntegrationQuest[];
  };
  google_calendar: {
    connected: boolean;
    source: string;
    events: IntegrationCalendarEvent[];
    study_blocks: IntegrationCalendarEvent[];
    generated_quests: IntegrationQuest[];
    boss_fights: Array<{
      id: number;
      title: string;
      subject: string;
      exam_date: string | null;
      duration_minutes: number;
      difficulty: string;
      completed: boolean;
      xp_awarded: number;
      topics: string[];
    }>;
  };
  workflow: {
    engine: string;
    generated_at: string;
    summary: {
      connected: boolean;
      ticktick_tasks: number;
      ticktick_open_tasks: number;
      ticktick_overdue_tasks: number;
      ticktick_due_today: number;
      ticktick_due_next_7_days: number;
      calendar_events: number;
      study_blocks: number;
      exam_events: number;
      free_windows: number;
    };
    task_priorities: Array<{
      id: string | null;
      title: string | null;
      project_name: string | null;
      subject: string | null;
      due_date: string | null;
      difficulty: string;
      xp_reward: number;
      priority_score: number;
      estimated_pomodoros: number;
      reason: string;
      source: string;
    }>;
    calendar_load: Array<{
      date: string;
      events: Array<{
        id: string | null;
        title: string;
        starts_at: string;
        ends_at: string;
        is_study_block: boolean;
        subject: string;
        used_as: string;
      }>;
      free_windows: Array<{
        start: string;
        end: string;
        duration_minutes: number;
      }>;
      busy_minutes: number;
      study_blocks: Array<Record<string, unknown>>;
      exam_events: Array<Record<string, unknown>>;
    }>;
    subject_load: Array<{
      subject: string;
      task_count: number;
      event_count: number;
      xp: number;
      score: number;
    }>;
    recommendations: string[];
    plan: Array<{
      date: string;
      label: string;
      focus_minutes: number;
      study_blocks: number;
      exam_events: number;
      top_tasks: Array<{
        title: string | null;
        subject: string | null;
        difficulty: string | null;
        xp_reward: number | null;
        estimated_pomodoros: number;
        reason: string | null;
      }>;
      recommended_feature: string;
    }>;
    best_mode_today: {
      name: string;
      reason: string;
      minutes: number;
    };
    task_to_feature_map: Array<{
      feature: string;
      use: string;
    }>;
  };
};

export type IntegrationInterpretation = {
  used_as: string;
  subject: string;
  difficulty: string;
  xp_reward: number;
  quest_type?: string;
  reasons: string[];
};

export type IntegrationTask = {
  id: string | null;
  project_id: string | null;
  title: string;
  content: string;
  status: string;
  priority: number | null;
  tags: string[];
  due_date: string | null;
  raw_due_date: string | null;
  raw_start_date: string | null;
  is_all_day: boolean;
  time_zone: string | null;
  subject: string;
  difficulty: string;
  xp_reward: number;
  quest_type: string;
  interpretation: IntegrationInterpretation;
};

export type IntegrationCalendarEvent = {
  id: string | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  event_type: string;
  is_study_block: boolean;
  subject: string;
  interpretation: IntegrationInterpretation;
};

export type IntegrationQuest = {
  id: number;
  title: string;
  subject: string;
  type: string;
  difficulty: string;
  xp_reward: number;
  due_date: string | null;
  completed: boolean;
  external_source: string | null;
  description: string;
};

export type AssistantMessage = {
  id: number;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
};

export type AssistantMemory = {
  id: number;
  category: string;
  key: string;
  value: string;
  weight: number;
  created_at: string;
};

export type AssistantState = {
  messages: AssistantMessage[];
  memories: AssistantMemory[];
  summary: {
    total_memories: number;
    study_windows: string[];
    subject_focus: string[];
    timer_preference: string | null;
    preferences: string[];
  };
};

export type AssistantReply = {
  message: AssistantMessage;
  needs_follow_up: boolean;
  follow_up_question: string | null;
  memories_added: Array<{
    category: string;
    key: string;
    value: string;
    weight: number;
  }>;
  summary: AssistantState["summary"];
};
