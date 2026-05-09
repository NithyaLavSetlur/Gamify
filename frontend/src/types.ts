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
