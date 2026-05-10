import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  BarChart3,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gauge,
  Gem,
  Hourglass,
  Import,
  Link,
  ListChecks,
  Lock,
  Maximize2,
  Play,
  Plus,
  Pause,
  RefreshCcw,
  Settings,
  Shield,
  Snowflake,
  Sparkles,
  Swords,
  Moon,
  Target as TargetIcon,
  TimerReset,
  Target,
  Trophy,
  Wand2,
  MessageCircle,
  Send,
  X,
  Zap,
  Sun
} from "lucide-react";
import { api, apiBaseUrl } from "./lib/api";
import type { AssistantMessage, AssistantState, BossFight, CalendarEvent, DashboardState, DeploymentConfig, IntegrationCalendarEvent, IntegrationIntelligence, IntegrationTask, PomodoroBoard, PomodoroTask, Quest, StudySession } from "./types";
import { Button, Field, Panel, Progress, Select, TextArea } from "./components/ui";

type Page = "dashboard" | "integrations" | "quests" | "timer" | "bosses" | "calendar" | "ticktick" | "stats" | "settings";

const nav: Array<{ key: Page; label: string; icon: typeof Gauge }> = [
  { key: "dashboard", label: "Dashboard", icon: Gauge },
  { key: "integrations", label: "Data Hub", icon: Brain },
  { key: "quests", label: "Daily Quests", icon: ListChecks },
  { key: "timer", label: "Study Timer", icon: TimerReset },
  { key: "bosses", label: "Boss Fights", icon: Swords },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "ticktick", label: "TickTick", icon: Link },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings }
];

const today = new Date().toISOString().slice(0, 10);
const difficultyTone: Record<string, string> = {
  easy: "text-teal-200 bg-jade/12 border-jade/30",
  medium: "text-amber-100 bg-gold/12 border-gold/30",
  hard: "text-orange-100 bg-ember/12 border-ember/30",
  boss: "text-violet-100 bg-rune/16 border-rune/40"
};

const smoothSpring = { type: "spring", stiffness: 260, damping: 28 } as const;
const smoothEase = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

function fullscreenElement() {
  const doc = document as FullscreenDoc;
  return document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
}

async function enterDeviceFullscreen() {
  if (typeof document === "undefined" || fullscreenElement()) return Boolean(fullscreenElement());
  const target = document.documentElement as FullscreenTarget;
  const request = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
  if (!request) return false;
  try {
    await request.call(target);
    return true;
  } catch {
    return false;
  }
}

async function exitDeviceFullscreen() {
  if (typeof document === "undefined" || !fullscreenElement()) return;
  const doc = document as FullscreenDoc;
  const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
  try {
    await exit?.call(document);
  } catch {
    // Browsers can reject this if fullscreen already changed; closing the overlay should still continue.
  }
}

export default function App() {
  const [page, setPage] = useState<Page>("timer");
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const stored = window.localStorage.getItem("gamify-theme");
      return stored === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [levelFlash, setLevelFlash] = useState(false);
  const [rewardBurst, setRewardBurst] = useState(0);
  const [lockInRequest, setLockInRequest] = useState(0);

  const refresh = async () => {
    try {
      const next = await api.dashboard();
      setState((previous) => {
        if (previous && next.profile.level > previous.profile.level) {
          setLevelFlash(true);
          setRewardBurst(Date.now());
          window.setTimeout(() => setLevelFlash(false), 1500);
        }
        return next;
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("gamify-last-page", page);
    } catch {
      // Ignore storage failures in private browsing or restricted environments.
    }
  }, [page]);

  useEffect(() => {
    setNavOpen(false);
  }, [page]);

  useEffect(() => {
    try {
      window.localStorage.setItem("gamify-theme", theme);
    } catch {
      // Ignore storage failures.
    }
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  const wording = state?.profile.shrivaishnava_mode
    ? { quests: "Sadhana", focus: "Mind refinement", streak: "Discipline flame", mission: "Today's refinement" }
    : { quests: "Quests", focus: "Focus", streak: "Daily streak", mission: "Today's mission" };
  const nextQuest = useMemo(() => selectNextQuest(state?.quests ?? []), [state]);

  const completeWithReward = async (action: () => Promise<void>, major = false) => {
    await action();
    if (major) setRewardBurst(Date.now());
    await refresh();
  };

  const toggleTheme = () => setTheme((current) => (current === "light" ? "dark" : "light"));
  const themeLabel = theme === "light" ? "Dark mode" : "Light mode";
  const ThemeIcon = theme === "light" ? Moon : Sun;
  const openLockIn = () => {
    void enterDeviceFullscreen();
    setPage("timer");
    setLockInRequest(Date.now());
  };

  if (loading) {
    return (
      <div className={theme === "light" ? "claude-shell theme-light" : "theme-dark"}>
        <main className="grid min-h-screen place-items-center text-slate-200">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <Shield className="mx-auto mb-3 text-jade" size={42} />
            <p className="font-black">Loading your lock-in room...</p>
          </motion.div>
        </main>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={theme === "light" ? "claude-shell theme-light" : "theme-dark"}>
        <main className="grid min-h-screen place-items-center px-4 text-slate-200">
          <Panel className="max-w-xl">
            <h1 className="text-xl font-bold">Backend unavailable</h1>
            <p className="mt-2 text-sm text-slate-400">{error || "Start FastAPI on port 8000."}</p>
            <Button className="mt-4" onClick={refresh}>
              <RefreshCcw size={16} /> Retry
            </Button>
          </Panel>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen overflow-x-hidden text-slate-100 ${theme === "light" ? "claude-shell theme-light" : "theme-dark"}`}>
      <AmbientBackdrop />
      <RewardBurst seed={rewardBurst} />
      <AssistantBubbleV2 />
      <AnimatePresence>
        {levelFlash && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            className="fixed left-1/2 top-8 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-gold/60 bg-midnight/95 p-5 text-center shadow-goldglow"
          >
            <Sparkles className="mx-auto text-gold" />
            <p className="mt-2 text-sm uppercase tracking-[0.18em] text-gold">Level Up</p>
            <h2 className="text-2xl font-black text-white">Level {state.profile.level}</h2>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-30 hidden border-b border-slate-200/80 bg-white/85 backdrop-blur-xl md:block">
        <div className="mx-auto max-w-[96rem] px-4 py-3 md:px-6 xl:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setNavOpen((value) => !value)}
              className="group flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(71,61,104,0.08)] transition hover:border-violet-200 hover:shadow-[0_16px_30px_rgba(109,87,230,0.12)]"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-600 text-white">
                <Shield size={16} />
              </div>
              <div className="text-left">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Study workspace</p>
                <h1 className="text-sm font-black text-slate-900">{state.profile.display_name}</h1>
              </div>
              <ChevronRight className={`ml-1 transition duration-300 ${navOpen ? "rotate-90" : "rotate-0"}`} size={16} />
            </button>
            <div className="flex items-center gap-2">
              <Badge tone="boss">Level {state.profile.level}</Badge>
              <Badge tone="easy">{state.profile.rank_title}</Badge>
              <button
                onClick={openLockIn}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-slate-900"
              >
                Lock in
              </button>
              <Button variant="ghost" onClick={toggleTheme} className="rounded-full">
                <ThemeIcon size={16} /> {themeLabel}
              </Button>
            </div>
          </div>
          <AnimatePresence>
            {navOpen && (
              <>
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={smoothEase}
                  onClick={() => setNavOpen(false)}
                  className="nav-overlay-backdrop fixed inset-0 top-[4.75rem] z-30 cursor-default bg-slate-950/10 backdrop-blur-[3px]"
                />
                <motion.div
                  initial={{ opacity: 0, x: "-50%", y: -10, scale: 0.99 }}
                  animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: "-50%", y: -10, scale: 0.99 }}
                  transition={smoothSpring}
                  className="nav-overlay-panel fixed left-1/2 top-[4.75rem] z-40 w-[min(68rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_24px_70px_rgba(71,61,104,0.16)] backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Navigation</p>
                      <p className="text-sm font-black text-slate-900">Choose your workspace</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close navigation"
                      onClick={() => setNavOpen(false)}
                      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:text-slate-950"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
                    {nav.map((item) => {
                      const Icon = item.icon;
                      const active = page === item.key;
                      return (
                        <motion.button
                          key={item.key}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setPage(item.key)}
                          className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                            active
                              ? "border-violet-300 bg-violet-600 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-white"
                          }`}
                        >
                          <span className={`grid h-9 w-9 place-items-center rounded-full ${active ? "bg-white/15" : "bg-white text-violet-600"}`}>
                            <Icon size={16} />
                          </span>
                          <span>
                            <span className="block text-sm font-black">{item.label}</span>
                            <span className={`block text-xs ${active ? "text-violet-100" : "text-slate-500"}`}>
                              Open {item.label.toLowerCase()}
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <aside className="hidden">
        <div className="mb-5 rounded-lg border border-jade/20 bg-jade/8 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-jade text-ink shadow-glow">
              <Shield />
            </div>
            <div className="min-w-0 pl-1">
              <p className="text-xs uppercase tracking-[0.18em] text-jade">Study RPG</p>
              <h1 className="font-black">{state.profile.display_name}</h1>
            </div>
          </div>
          <div className="mt-4">
            <Progress value={state.profile.xp_into_level} max={state.profile.xp_for_next_level} tone="gold" />
            <p className="mt-2 text-xs text-slate-400">{state.profile.rank_title} · Level {state.profile.level}</p>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${page === item.key ? "bg-jade text-ink shadow-glow" : "text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-3"><Icon size={17} /> {item.label}</span>
                <ChevronRight size={15} className={page === item.key ? "opacity-100" : "opacity-0 transition group-hover:opacity-70"} />
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-[96rem] px-3 py-3 md:px-6 md:py-6 xl:px-8">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur md:hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Select value={page} onChange={(event) => setPage(event.target.value as Page)}>
              {nav.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
            </Select>
            <Button variant="ghost" aria-label={themeLabel} onClick={toggleTheme} className="h-11 w-11 rounded-lg px-0">
              <ThemeIcon size={16} />
            </Button>
            <Button onClick={openLockIn} className="h-11 rounded-lg px-3">
              <Maximize2 size={16} />
              <span className="hidden min-[360px]:inline">Lock</span>
            </Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[96rem] px-0 py-4 md:px-0 md:py-5">
          {error && <div className="mb-4 rounded-md border border-ember/40 bg-ember/10 p-3 text-sm text-orange-100">{error}</div>}
          <RankHero state={state} wording={wording} />
      <QuickLaunch state={state} nextQuest={nextQuest} setPage={setPage} refresh={refresh} wording={wording} />
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={smoothEase}>
              {page === "dashboard" && <Dashboard state={state} refresh={refresh} completeWithReward={completeWithReward} wording={wording} />}
              {page === "integrations" && <IntegrationDataHub refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "quests" && <Quests state={state} refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "timer" && <StudyTimer state={state} refresh={refresh} triggerReward={() => setRewardBurst(Date.now())} lockInRequest={lockInRequest} />}
              {page === "bosses" && <Bosses state={state} refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "calendar" && <CalendarView state={state} refresh={refresh} />}
              {page === "ticktick" && <TickTick state={state} refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "stats" && <Stats state={state} />}
              {page === "settings" && <SettingsPage state={state} refresh={refresh} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function RankHero({ state, wording }: { state: DashboardState; wording: Record<string, string> }) {
  const profile = state.profile;
  return (
    <section className="mb-5 grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={smoothEase}
        className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-panel via-midnight to-ink p-5 shadow-glow sm:p-6"
      >
        <div className="absolute right-[-3rem] top-[-5rem] hidden h-48 w-48 rounded-full bg-jade/10 blur-3xl sm:block" />
        <div className="absolute bottom-[-6rem] left-1/3 hidden h-56 w-56 rounded-full bg-rune/12 blur-3xl sm:block" />
        <div className="soft-float absolute right-8 top-8 hidden h-24 w-24 rounded-full border border-gold/20 bg-gold/5 lg:block">
          <div className="absolute inset-4 rounded-full border border-jade/20" />
          <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold" size={24} />
        </div>
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
              <Trophy size={14} /> Current Rank: {profile.rank_title}
            </div>
            <h2 className="text-2xl font-black !text-white sm:text-3xl md:text-4xl">Level {profile.level} Study Run</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[rgba(255,255,255,0.72)]">{state.quote.body}</p>
            <div className="mt-5 max-w-2xl">
              <div className="mb-2 flex justify-between text-sm text-[rgba(255,255,255,0.72)]">
                <span>{profile.xp_into_level} XP charged</span>
                <span>{profile.xp_for_next_level} XP to next level</span>
              </div>
              <Progress value={profile.xp_into_level} max={profile.xp_for_next_level} tone="gold" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <MiniStat icon={<Flame className="flame-flicker text-ember" />} label={wording.streak} value={`${profile.current_streak}d`} />
            <MiniStat icon={<Zap className="text-gold" />} label="Combo" value={`${profile.combo_count}x`} />
            <MiniStat icon={<Snowflake className="text-cyan-200" />} label="Freeze" value={profile.streak_freezes.toString()} />
            <MiniStat icon={<Gem className="text-rune" />} label="Total XP" value={profile.xp.toString()} />
          </div>
        </div>
      </motion.div>
      <Panel className="mission-panel flex flex-col justify-center bg-gradient-to-br from-panel2/90 to-midnight">
        <h3 className="mb-3 text-lg font-black text-white">{wording.mission}</h3>
        <div className="grid grid-cols-2 gap-3">
          <ProgressRing value={state.goals.daily_xp} max={state.goals.daily_goal} label="Daily XP" />
          <ProgressRing value={state.goals.weekly_xp} max={state.goals.weekly_goal} label="Weekly XP" />
        </div>
      </Panel>
    </section>
  );
}

function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-grid absolute inset-0 opacity-55" />
      <div className="ambient-orb absolute left-[10%] top-[8%] h-56 w-56 rounded-full bg-jade/10 blur-3xl" />
      <div className="ambient-orb absolute right-[8%] top-[18%] h-64 w-64 rounded-full bg-rune/10 blur-3xl [animation-delay:1.2s]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/5 to-transparent" />
    </div>
  );
}

function QuickLaunch({ state, nextQuest, setPage, refresh, wording }: { state: DashboardState; nextQuest: Quest | null; setPage: (page: Page) => void; refresh: () => Promise<void>; wording: Record<string, string> }) {
  const [syncing, setSyncing] = useState(false);
  const todayPct = Math.min(100, Math.round((state.goals.daily_xp / Math.max(1, state.goals.daily_goal)) * 100));
  return (
    <section className="mb-5 grid grid-cols-3 gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setPage("quests")}
        className="group col-span-3 min-h-20 rounded-lg border border-jade/20 bg-gradient-to-br from-jade/12 to-ink/70 p-4 text-left shadow-glow transition hover:border-jade/45 lg:col-span-1 xl:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade">Next move</p>
            <h3 className="mt-1 line-clamp-1 text-base font-black text-white">{nextQuest?.title ?? "Create a focused quest"}</h3>
            <p className="mt-1 text-xs text-slate-400">{nextQuest ? `${nextQuest.subject} - ${nextQuest.xp_reward} XP` : `${wording.focus} starts with one clear action.`}</p>
          </div>
          <Target className="text-jade transition group-hover:scale-110" />
        </div>
      </motion.button>
      <QuickButton icon={<Play size={17} />} label="Focus" sub="Timer" onClick={() => setPage("timer")} />
      <QuickButton icon={<Wand2 size={17} />} label={`${todayPct}%`} sub="Daily XP" onClick={() => setPage("stats")} />
      <QuickButton
        icon={<RefreshCcw size={17} className={syncing ? "animate-spin" : ""} />}
        label={syncing ? "Syncing" : "Sync"}
        sub="Feeds"
        onClick={async () => {
          setSyncing(true);
          try {
            await api.syncAll();
            await refresh();
          } finally {
            setSyncing(false);
          }
        }}
      />
    </section>
  );
}

function QuickButton({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void | Promise<void> }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => void onClick()}
      className="rounded-lg border border-white/10 bg-panel/70 px-4 py-3 text-left shadow-glow backdrop-blur transition hover:border-gold/30 hover:bg-white/8 xl:px-5 xl:py-4"
    >
      <span className="mb-2 grid h-9 w-9 place-items-center rounded-md bg-white/8 text-gold sm:h-10 sm:w-10">{icon}</span>
      <span className="block text-lg font-black text-white xl:text-xl">{label}</span>
      <span className="text-sm text-slate-400">{sub}</span>
    </motion.button>
  );
}

function Dashboard({ state, refresh, completeWithReward, wording }: { state: DashboardState; refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void>; wording: Record<string, string> }) {
  const daily = state.quests.filter((q) => q.type === "daily");
  const connectedCount = Number(state.integrations.ticktick.connected) + Number(state.integrations.google_calendar.connected);
  const nextQuest = selectNextQuest(state.quests);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <Panel className="xl:row-span-2">
        <PanelHeader title={`${wording.quests} Board`} action={<DashboardActions refresh={refresh} />} />
        <NextActionCard quest={nextQuest} completeWithReward={completeWithReward} />
        <EnhancedQuestBoard quests={daily.length ? daily : state.quests.slice(0, 6)} completeWithReward={completeWithReward} />
      </Panel>
      <Panel>
        <PanelHeader title="Integration Intel" />
        <div className="grid gap-2.5 sm:grid-cols-3">
          <MiniStat icon={<Import className="text-jade" />} label="Connected feeds" value={`${connectedCount}/2`} />
          <MiniStat icon={<ListChecks className="text-gold" />} label="Imported quests" value={state.quests.filter((q) => q.external_source).length.toString()} />
          <MiniStat icon={<CalendarDays className="text-rune" />} label="Study events" value={state.events.filter((event) => event.is_study_block).length.toString()} />
        </div>
        <p className="mt-3 text-xs text-slate-400">Sync turns TickTick priorities into quest difficulty and Calendar study/exam events into focus quests or boss fights.</p>
      </Panel>
      <Panel>
        <PanelHeader title="Calendar Timeline" />
        <Timeline events={state.events.slice(0, 4)} />
      </Panel>
      <Panel>
        <PanelHeader title="Subject Mastery" />
        <MasteryCards mastery={state.mastery.slice(0, 4)} />
      </Panel>
      <Panel>
        <PanelHeader title="Achievements" />
        <AchievementGrid achievements={state.locked_achievements.slice(0, 4)} />
      </Panel>
      <Panel>
        <PanelHeader title="Recent Sessions" />
        <SessionList sessions={state.sessions.slice(0, 4)} />
      </Panel>
    </div>
  );
}

function IntegrationDataHub({ refresh, completeWithReward }: { refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const [intel, setIntel] = useState<IntegrationIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"overview" | "workflow" | "ticktick" | "calendar" | "gameplay">("overview");
  const load = async () => {
    setLoading(true);
    try {
      setIntel(await api.integrationIntelligence());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("ticktick-updated", handler);
    window.addEventListener("workflow-context-updated", handler);
    return () => {
      window.removeEventListener("ticktick-updated", handler);
      window.removeEventListener("workflow-context-updated", handler);
    };
  }, []);
  const sync = async () => {
    setSyncing(true);
    try {
      await api.syncAll();
      await refresh();
      await load();
    } finally {
      setSyncing(false);
    }
  };
  if (loading || !intel) {
    return (
      <Panel>
        <PanelHeader title="Integration Data Hub" />
        <p className="text-sm text-slate-400">Reading TickTick and Calendar interpretation...</p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4">
      <Panel className="bg-gradient-to-br from-panel via-panel2/70 to-ink">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade">Integration Intelligence</p>
            <h2 className="mt-1 text-3xl font-black text-white">See what was imported and how it becomes gameplay</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">This page is the source-of-truth view: raw TickTick projects, Calendar events, and the exact rules used to turn them into quests, XP, boss fights, mastery, and streak progress.</p>
          </div>
          <Button onClick={sync} disabled={syncing}>
            <RefreshCcw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing" : "Sync + reclassify"}
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MiniStat icon={<ListChecks className="text-gold" />} label="Imported quests" value={String(intel.summary.imported_quests)} />
          <MiniStat icon={<Link className="text-jade" />} label="Open TickTick" value={String(intel.summary.open_ticktick_tasks)} />
          <MiniStat icon={<CalendarDays className="text-rune" />} label="Study blocks" value={String(intel.summary.google_study_blocks)} />
          <MiniStat icon={<Swords className="text-ember" />} label="Boss fights" value={String(intel.summary.boss_fights)} />
          <MiniStat icon={<Sparkles className="text-jade" />} label="Study events" value={String(intel.summary.study_events)} />
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        {(["overview", "workflow", "ticktick", "calendar", "gameplay"] as const).map((item) => (
          <Button key={item} variant={tab === item ? "primary" : "ghost"} onClick={() => setTab(item)}>
            {item === "overview" ? "How it works" : item === "workflow" ? "Workflow AI" : item === "ticktick" ? "TickTick data" : item === "calendar" ? "Calendar data" : "Generated gameplay"}
          </Button>
        ))}
      </div>

      {tab === "overview" && <IntegrationRules rules={intel.rules} />}
      {tab === "workflow" && <EnhancedWorkflowIntelligencePanel workflow={intel.workflow} />}
      {tab === "ticktick" && <TickTickDataExplorer intel={intel} completeWithReward={completeWithReward} />}
      {tab === "calendar" && <CalendarDataExplorer intel={intel} />}
      {tab === "gameplay" && <GeneratedGameplay intel={intel} completeWithReward={completeWithReward} />}
    </div>
  );
}

function EnhancedWorkflowIntelligencePanel({ workflow }: { workflow: IntegrationIntelligence["workflow"] }) {
  const topTask = workflow.task_priorities[0];
  const today = workflow.plan[0];
  const modelLabel = workflow.model_briefing.model_used ? "OpenAI assisted" : "Rules engine";
  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <Panel>
        <PanelHeader title="Workflow AI" action={<Badge tone={workflow.model_briefing.model_used ? "boss" : "easy"}>{modelLabel}</Badge>} />
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat icon={<Target className="text-jade" />} label="Best mode today" value={workflow.best_mode_today.name} />
          <MiniStat icon={<CalendarDays className="text-gold" />} label="Free windows" value={String(workflow.summary.free_windows)} />
          <MiniStat icon={<ListChecks className="text-rune" />} label="Due today" value={String(workflow.summary.ticktick_due_today)} />
          <MiniStat icon={<Swords className="text-ember" />} label="Exam events" value={String(workflow.summary.exam_events)} />
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-ink/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Today's workflow</p>
          <h3 className="mt-2 text-2xl font-black text-white">{workflow.best_mode_today.name}</h3>
          <p className="mt-2 text-sm text-slate-300">{workflow.best_mode_today.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="easy">{workflow.best_mode_today.minutes} min blocks</Badge>
            <Badge tone="medium">{today.focus_minutes} min usable focus time</Badge>
            <Badge tone="hard">{today.top_tasks.length} top tasks</Badge>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-rune/20 bg-rune/10 p-4">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 shrink-0 text-rune" size={20} />
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-violet-300">AI briefing</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">{workflow.model_briefing.daily_brief}</p>
              <p className="mt-2 text-xs text-slate-400">{workflow.model_briefing.focus_rule}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {workflow.recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-lg border border-white/10 bg-ink/45 p-3 text-sm text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Next AI Session" />
        <div className="mb-4 rounded-lg border border-gold/25 bg-gold/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gold">Recommended lock-in</p>
              <h3 className="mt-2 text-xl font-black text-white">{workflow.next_session.title ?? "Deep work block"}</h3>
              <p className="mt-1 text-sm text-slate-300">{workflow.next_session.subject} - {workflow.next_session.minutes} min - {workflow.next_session.mode.replace("_", " ")}</p>
            </div>
            <Badge tone="medium">{workflow.next_session.source ?? "ai"}</Badge>
          </div>
          <p className="mt-3 text-sm text-slate-300">{workflow.next_session.reason}</p>
          {workflow.next_session.start && <p className="mt-2 text-xs text-slate-500">Best window: {new Date(workflow.next_session.start).toLocaleString()} - {workflow.next_session.end ? new Date(workflow.next_session.end).toLocaleTimeString() : ""}</p>}
        </div>

        <PanelHeader title="Top Priority Task" />
        {topTask ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-jade/25 bg-jade/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-jade">Next action</p>
              <h3 className="mt-2 text-xl font-black text-white">{topTask.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{topTask.project_name} - {topTask.subject}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <SettingPill label="Priority" value={topTask.priority_score.toFixed(1)} />
                <SettingPill label="Pomodoros" value={String(topTask.estimated_pomodoros)} />
                <SettingPill label="XP" value={`${topTask.xp_reward} XP`} />
              </div>
              <p className="mt-3 text-sm text-slate-300">{topTask.reason}</p>
              <p className="mt-2 text-xs font-semibold text-jade">{topTask.recommended_action}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={topTask.difficulty}>{topTask.urgency}</Badge>
                <Badge tone="easy">{topTask.target_feature}</Badge>
                {topTask.ai_tags.slice(0, 4).map((tag) => <span key={tag} className="rounded border border-white/10 bg-white/7 px-2 py-1 text-xs text-slate-300">{tag}</span>)}
              </div>
            </div>
            <div className="grid gap-2">
              {workflow.task_priorities.slice(0, 6).map((task) => (
                <div key={`${task.id ?? task.title}-${task.priority_score}`} className="rounded-lg border border-white/10 bg-ink/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white">{task.title}</h4>
                      <p className="text-xs text-slate-400">{task.project_name} - {task.subject} - {task.difficulty}</p>
                    </div>
                    <Badge tone={task.difficulty}>{task.estimated_pomodoros} pomos</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{task.due_date ? `Due ${task.due_date}` : "No due date"} - {task.reason}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded bg-white/7 px-2 py-1 text-[11px] text-slate-300">{task.target_feature}</span>
                    <span className="rounded bg-white/7 px-2 py-1 text-[11px] text-slate-300">{task.urgency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={<Brain />} title="No task pressure detected" body="Sync TickTick and Calendar to generate a real workflow forecast." />
        )}
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader title="AI Actions Across The App" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workflow.ai_actions.map((action) => (
            <div key={`${action.surface}-${action.title}`} className="rounded-lg border border-white/10 bg-ink/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{action.surface}</p>
                  <h3 className="mt-1 font-black text-white">{action.title}</h3>
                </div>
                <Badge tone={action.priority === "high" ? "hard" : action.priority === "medium" ? "medium" : "easy"}>{action.priority}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{action.body}</p>
              <p className="mt-3 text-xs font-semibold text-jade">{action.cta}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader title="7-Day Workflow Map" />
        <div className="grid gap-3 lg:grid-cols-7">
          {workflow.plan.map((day) => (
            <div key={day.date} className="rounded-lg border border-white/10 bg-ink/45 p-3">
              <div className="mb-2">
                <p className="text-sm font-black text-white">{day.label}</p>
                <p className="text-xs text-slate-500">{day.date}</p>
              </div>
              <p className="text-xs text-slate-400">{day.focus_minutes} min focus</p>
              <p className="mt-1 text-xs text-slate-400">{day.recommended_feature}</p>
              <div className="mt-3 space-y-2">
                {day.top_tasks.length === 0 ? (
                  <p className="rounded border border-dashed border-white/10 p-2 text-xs text-slate-500">No priority tasks</p>
                ) : day.top_tasks.map((task) => (
                  <div key={`${day.date}-${task.title}`} className="rounded-md bg-white/7 p-2">
                    <p className="text-xs font-bold text-white">{task.title}</p>
                    <p className="text-[11px] text-slate-400">{task.subject} - {task.estimated_pomodoros} pomos</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader title="Feature Allocation" />
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SettingPill label="Quest sort" value={workflow.smart_defaults.quest_sort} />
          <SettingPill label="Timer" value={`${workflow.smart_defaults.timer_minutes} min ${workflow.smart_defaults.timer_mode.replace("_", " ")}`} />
          <SettingPill label="Default subject" value={workflow.smart_defaults.default_subject} />
          <SettingPill label="Boss first" value={workflow.smart_defaults.show_boss_first ? "Yes" : "No"} />
        </div>
        {workflow.data_quality.length > 0 && (
          <div className="mb-4 grid gap-2 md:grid-cols-2">
            {workflow.data_quality.map((item) => (
              <div key={`${item.title}-${item.body}`} className="rounded-lg border border-gold/20 bg-gold/8 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{item.level}</p>
                <h4 className="mt-1 font-bold text-white">{item.title}</h4>
                <p className="mt-1 text-sm text-slate-400">{item.body}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workflow.task_to_feature_map.map((item) => (
            <div key={item.feature} className="rounded-lg border border-white/10 bg-ink/45 p-4">
              <h3 className="font-bold text-white">{item.feature}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.use}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function WorkflowIntelligencePanel({ workflow }: { workflow: IntegrationIntelligence["workflow"] }) {
  const topTask = workflow.task_priorities[0];
  const today = workflow.plan[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <Panel>
        <PanelHeader title="Workflow AI" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat icon={<Target className="text-jade" />} label="Best mode today" value={workflow.best_mode_today.name} />
          <MiniStat icon={<CalendarDays className="text-gold" />} label="Free windows" value={String(workflow.summary.free_windows)} />
          <MiniStat icon={<ListChecks className="text-rune" />} label="Due today" value={String(workflow.summary.ticktick_due_today)} />
          <MiniStat icon={<Swords className="text-ember" />} label="Exam events" value={String(workflow.summary.exam_events)} />
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-ink/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Today&apos;s workflow</p>
          <h3 className="mt-2 text-2xl font-black text-white">{workflow.best_mode_today.name}</h3>
          <p className="mt-2 text-sm text-slate-300">{workflow.best_mode_today.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="easy">{workflow.best_mode_today.minutes} min blocks</Badge>
            <Badge tone="medium">{today.focus_minutes} min usable focus time</Badge>
            <Badge tone="hard">{today.top_tasks.length} top tasks</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {workflow.recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-lg border border-white/10 bg-ink/45 p-3 text-sm text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Top Priority Task" />
        {topTask ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-jade/25 bg-jade/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-jade">Next action</p>
              <h3 className="mt-2 text-xl font-black text-white">{topTask.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{topTask.project_name} · {topTask.subject}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <SettingPill label="Priority" value={topTask.priority_score.toFixed(1)} />
                <SettingPill label="Pomodoros" value={String(topTask.estimated_pomodoros)} />
                <SettingPill label="XP" value={`${topTask.xp_reward} XP`} />
              </div>
              <p className="mt-3 text-sm text-slate-300">{topTask.reason}</p>
            </div>
            <div className="grid gap-2">
              {workflow.task_priorities.slice(0, 6).map((task) => (
                <div key={`${task.id ?? task.title}-${task.priority_score}`} className="rounded-lg border border-white/10 bg-ink/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white">{task.title}</h4>
                      <p className="text-xs text-slate-400">{task.project_name} · {task.subject} · {task.difficulty}</p>
                    </div>
                    <Badge tone={task.difficulty}>{task.estimated_pomodoros} pomos</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {task.due_date ? `Due ${task.due_date}` : "No due date"} · {task.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={<Brain />} title="No task pressure detected" body="Sync TickTick and Calendar to generate a real workflow forecast." />
        )}
      </Panel>
      <Panel className="xl:col-span-2">
        <PanelHeader title="7-Day Workflow Map" />
        <div className="grid gap-3 lg:grid-cols-7">
          {workflow.plan.map((day) => (
            <div key={day.date} className="rounded-lg border border-white/10 bg-ink/45 p-3">
              <div className="mb-2">
                <p className="text-sm font-black text-white">{day.label}</p>
                <p className="text-xs text-slate-500">{day.date}</p>
              </div>
              <p className="text-xs text-slate-400">{day.focus_minutes} min focus</p>
              <p className="mt-1 text-xs text-slate-400">{day.recommended_feature}</p>
              <div className="mt-3 space-y-2">
                {day.top_tasks.length === 0 ? (
                  <p className="rounded border border-dashed border-white/10 p-2 text-xs text-slate-500">No priority tasks</p>
                ) : day.top_tasks.map((task) => (
                  <div key={`${day.date}-${task.title}`} className="rounded-md bg-white/7 p-2">
                    <p className="text-xs font-bold text-white">{task.title}</p>
                    <p className="text-[11px] text-slate-400">{task.subject} · {task.estimated_pomodoros} pomos</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="xl:col-span-2">
        <PanelHeader title="Feature Allocation" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workflow.task_to_feature_map.map((item) => (
            <div key={item.feature} className="rounded-lg border border-white/10 bg-ink/45 p-4">
              <h3 className="font-bold text-white">{item.feature}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.use}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function IntegrationRules({ rules }: { rules: string[] }) {
  return (
    <Panel>
      <PanelHeader title="How Gamify Interprets Your Data" />
      <div className="grid gap-3 lg:grid-cols-2">
        {rules.map((rule, index) => (
          <motion.div key={rule} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="rounded-lg border border-white/10 bg-ink/55 p-4">
            <div className="mb-2 flex items-center gap-2 text-jade">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-jade/10 text-xs font-black">{index + 1}</span>
              <span className="text-xs font-bold uppercase tracking-[0.14em]">Rule</span>
            </div>
            <p className="text-sm leading-6 text-slate-300">{rule}</p>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

function TickTickDataExplorer({ intel, completeWithReward }: { intel: IntegrationIntelligence; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const [projectId, setProjectId] = useState(intel.ticktick.projects[0]?.id ?? "");
  const selected = intel.ticktick.projects.find((project) => project.id === projectId) ?? intel.ticktick.projects[0];
  const allTasks = intel.ticktick.projects.flatMap((project) => project.tasks.map((task) => ({ ...task, project_name: project.name })));
  return (
    <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
      <Panel className="xl:col-span-2">
        <PanelHeader title="Next 7 Days" />
        <NextSevenDaysTasks tasks={allTasks} />
      </Panel>
      <Panel>
        <PanelHeader title="TickTick Projects" />
        <div className="space-y-2">
          {intel.ticktick.projects.map((project) => (
            <button key={project.id} onClick={() => setProjectId(project.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === project.id ? "border-jade/45 bg-jade/10" : "border-white/10 bg-ink/45 hover:bg-white/8"}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black text-white">{project.name}</h3>
                <span className="text-xs text-slate-400">{project.open}/{project.total} open</span>
              </div>
              <Progress value={project.completed} max={Math.max(1, project.total)} tone="jade" />
            </button>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title={selected ? `${selected.name} Tasks` : "TickTick Tasks"} />
        {!selected ? <EmptyState icon={<Link />} title="No TickTick data" body="Sync TickTick to show projects and tasks here." /> : (
          <div className="grid gap-3">
            {selected.tasks.map((task) => <IntegrationTaskCard key={`${selected.id}-${task.id}-${task.title}`} task={task} />)}
          </div>
        )}
      </Panel>
      <Panel className="xl:col-span-2">
        <PanelHeader title="TickTick Quests Created in Gamify" />
        <EnhancedQuestBoard quests={intel.ticktick.generated_quests.map(integrationQuestToQuest)} completeWithReward={completeWithReward} />
      </Panel>
    </div>
  );
}

function NextSevenDaysTasks({ tasks }: { tasks: Array<IntegrationTask & { project_name?: string }> }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: index === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      tasks: tasks
        .filter((task) => task.status !== "completed" && task.due_date === key)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.xp_reward - a.xp_reward),
    };
  });
  const unscheduled = tasks.filter((task) => task.status !== "completed" && !task.due_date);
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map((day) => (
        <div key={day.key} className="min-h-40 rounded-lg border border-white/10 bg-ink/45 p-3">
          <div className="mb-3">
            <p className="text-sm font-black text-white">{day.label}</p>
            <p className="text-xs text-slate-500">{day.dateLabel}</p>
          </div>
          <div className="space-y-2">
            {day.tasks.length === 0 ? (
              <p className="rounded border border-dashed border-white/10 p-2 text-xs text-slate-500">Clear</p>
            ) : day.tasks.map((task) => (
              <div key={`${task.project_id}-${task.id}`} className="rounded-md bg-white/7 p-2">
                <p className="line-clamp-2 text-xs font-bold text-white">{task.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">{task.project_name} - {task.xp_reward} XP</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 lg:col-span-7">
          <p className="text-sm font-black text-white">Unscheduled</p>
          <p className="mt-1 text-xs text-slate-400">{unscheduled.length} open TickTick tasks have no due date, so they are not placed into the next 7 days.</p>
        </div>
      )}
    </div>
  );
}

function IntegrationTaskCard({ task }: { task: IntegrationTask }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    content: task.content,
    due_date: task.due_date ?? "",
    priority: task.priority ?? 0,
  });
  const canEdit = Boolean(task.project_id && task.id);
  const save = async () => {
    if (!task.project_id || !task.id) return;
    setSaving(true);
    try {
      await api.updateTickTickTask(task.project_id, task.id, form);
      await api.syncTickTick();
      setEditing(false);
      window.dispatchEvent(new Event("ticktick-updated"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-lg border border-white/10 bg-gradient-to-br from-ink/70 to-panel2/45 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-white">{task.title}</h3>
            <Badge tone={task.difficulty}>{task.difficulty}</Badge>
            <span className="rounded border border-gold/30 bg-gold/12 px-2 py-1 text-xs font-bold text-gold">{task.xp_reward} XP</span>
            <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-300">{task.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{task.subject} - {task.quest_type} - {task.due_date ?? "no due date"}</p>
          {task.raw_due_date && <p className="mt-1 text-xs text-slate-500">TickTick dueDate: {task.raw_due_date}</p>}
          {task.tags.length > 0 && <p className="mt-2 text-xs text-slate-500">Tags: {task.tags.join(", ")}</p>}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <InterpretationPill interpretation={task.interpretation} />
          <Button variant="ghost" disabled={!canEdit} onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit in TickTick"}</Button>
        </div>
      </div>
      {editing && (
        <div className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-midnight/40 p-3">
          <Field value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <TextArea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
            <Select value={String(form.priority)} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}>
              <option value="0">No priority</option>
              <option value="1">Low priority</option>
              <option value="3">Medium priority</option>
              <option value="5">High priority</option>
            </Select>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving" : "Save to TickTick"}</Button>
        </div>
      )}
      <ReasonList reasons={task.interpretation.reasons} />
    </motion.div>
  );
}

function CalendarDataExplorer({ intel }: { intel: IntegrationIntelligence }) {
  const [mode, setMode] = useState<"list" | "month">("month");
  const [filter, setFilter] = useState<"all" | "study" | "boss">("all");
  const events = intel.google_calendar.events.filter((event) => {
    if (filter === "study") return event.is_study_block;
    if (filter === "boss") return event.interpretation.used_as === "boss_fight";
    return true;
  });
  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PanelHeader title="Custom Calendar View" />
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "month" ? "primary" : "ghost"} onClick={() => setMode("month")}>Month</Button>
            <Button variant={mode === "list" ? "primary" : "ghost"} onClick={() => setMode("list")}>List</Button>
            <Select value={filter} onChange={(event) => setFilter(event.target.value as "all" | "study" | "boss")} className="w-44">
              <option value="all">All events</option>
              <option value="study">Study only</option>
              <option value="boss">Boss prep</option>
            </Select>
          </div>
        </div>
        {mode === "month" ? <CalendarMatrix events={events} /> : <CalendarEventList events={events} />}
      </Panel>
      <Panel>
        <PanelHeader title="Calendar Quests + Bosses Created" />
        <div className="grid gap-3 lg:grid-cols-2">
          {intel.google_calendar.generated_quests.map((quest) => (
            <div key={quest.id} className="rounded-lg border border-white/10 bg-ink/50 p-3">
              <h3 className="font-black text-white">{quest.title}</h3>
              <p className="text-sm text-slate-400">{quest.subject} - {quest.difficulty} - {quest.xp_reward} XP</p>
            </div>
          ))}
          {intel.google_calendar.boss_fights.map((boss) => (
            <div key={boss.id} className="rounded-lg border border-rune/30 bg-rune/10 p-3">
              <h3 className="font-black text-white">{boss.title}</h3>
              <p className="text-sm text-slate-400">{boss.subject} - {boss.exam_date ?? "no date"} - 200 XP</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CalendarMatrix({ events }: { events: IntegrationCalendarEvent[] }) {
  const start = new Date();
  start.setDate(1);
  const days = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { key, date, events: events.filter((event) => event.starts_at.slice(0, 10) === key) };
  });
  return (
    <div className="mt-4 grid grid-cols-7 gap-2">
      {days.map((day) => (
        <div key={day.key} className="min-h-24 rounded-lg border border-white/10 bg-ink/45 p-2">
          <p className="mb-2 text-xs font-bold text-slate-500">{day.date.getDate()}</p>
          <div className="space-y-1">
            {day.events.slice(0, 3).map((event) => (
              <div key={`${day.key}-${event.id}-${event.title}`} title={event.title} className={`truncate rounded px-2 py-1 text-[11px] ${event.is_study_block ? "bg-jade/15 text-teal-100" : "bg-white/8 text-slate-300"}`}>
                {event.title}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarEventList({ events }: { events: IntegrationCalendarEvent[] }) {
  if (events.length === 0) return <EmptyState icon={<CalendarDays />} title="No matching events" body="Change the filter or sync Google Calendar again." />;
  return (
    <div className="mt-4 grid gap-3">
      {events.map((event) => (
        <motion.div key={`${event.id}-${event.starts_at}`} whileHover={{ y: -2 }} className="rounded-lg border border-white/10 bg-ink/50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-black text-white">{event.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{new Date(event.starts_at).toLocaleString()} - {new Date(event.ends_at).toLocaleTimeString()}</p>
            </div>
            <InterpretationPill interpretation={event.interpretation} />
          </div>
          <ReasonList reasons={event.interpretation.reasons} />
        </motion.div>
      ))}
    </div>
  );
}

function GeneratedGameplay({ intel, completeWithReward }: { intel: IntegrationIntelligence; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const quests = [...intel.ticktick.generated_quests, ...intel.google_calendar.generated_quests].map(integrationQuestToQuest);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Panel>
        <PanelHeader title="Generated Quests" />
        <EnhancedQuestBoard quests={quests} completeWithReward={completeWithReward} />
      </Panel>
      <Panel>
        <PanelHeader title="Generated Boss Fights" />
        <div className="grid gap-3">
          {intel.google_calendar.boss_fights.length === 0 ? <EmptyState icon={<Swords />} title="No boss fights yet" body="Calendar events with exam/test wording will appear here." /> : intel.google_calendar.boss_fights.map((boss) => (
            <div key={boss.id} className="rounded-lg border border-rune/30 bg-rune/10 p-4">
              <h3 className="font-black text-white">{boss.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{boss.subject} - {boss.exam_date ?? "no date"} - {boss.duration_minutes} min</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {boss.topics.slice(0, 4).map((topic) => <span key={topic} className="rounded bg-white/8 px-2 py-1 text-xs text-slate-300">{topic}</span>)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function InterpretationPill({ interpretation }: { interpretation: { used_as: string; difficulty: string; xp_reward: number } }) {
  return (
    <div className="rounded-lg border border-jade/20 bg-jade/10 px-3 py-2 text-right">
      <p className="text-xs uppercase tracking-[0.14em] text-jade">{interpretation.used_as.replace("_", " ")}</p>
      <p className="text-sm font-black text-white">{interpretation.difficulty} {interpretation.xp_reward ? `- ${interpretation.xp_reward} XP` : ""}</p>
    </div>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {reasons.map((reason) => <span key={reason} className="rounded border border-white/10 bg-white/6 px-2 py-1 text-xs text-slate-300">{reason}</span>)}
    </div>
  );
}

function integrationQuestToQuest(quest: IntegrationIntelligence["ticktick"]["generated_quests"][number]): Quest {
  return {
    id: quest.id,
    title: quest.title,
    description: quest.description,
    subject: quest.subject,
    type: quest.type,
    difficulty: quest.difficulty,
    xp_reward: quest.xp_reward,
    due_date: quest.due_date,
    completed: quest.completed,
    external_source: quest.external_source,
  };
}

function Quests({ state, refresh, completeWithReward }: { state: DashboardState; refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", subject: "General", type: "daily", difficulty: "easy", xp_reward: 10, due_date: today });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.createQuest(form);
    setForm({ ...form, title: "" });
    await refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <Panel>
        <PanelHeader title="Create Quest" />
        <form className="space-y-3" onSubmit={submit}>
          <Field required placeholder="Quest title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Field placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual</option>
            </Select>
            <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value, xp_reward: difficultyXp(e.target.value) })}>
              <option value="easy">Easy · 10 XP</option>
              <option value="medium">Medium · 30 XP</option>
              <option value="hard">Hard · 50 XP</option>
              <option value="boss">Boss · 200 XP</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field type="number" min={10} value={form.xp_reward} onChange={(e) => setForm({ ...form, xp_reward: Number(e.target.value) })} />
            <Field type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <Button type="submit"><Plus size={16} /> Add Quest</Button>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Quest Log" />
        <EnhancedQuestBoard quests={state.quests} completeWithReward={completeWithReward} />
      </Panel>
    </div>
  );
}

type TimerView = "pomodoro" | "rpg";
type PomodoroPhase = "pomodoro" | "short_break" | "long_break";

function StudyTimer({ state, refresh, triggerReward, lockInRequest }: { state: DashboardState; refresh: () => Promise<void>; triggerReward: () => void; lockInRequest: number }) {
  const [view, setView] = useState<TimerView>(() => {
    try {
      return (window.localStorage.getItem("gamify-timer-view") as TimerView) || "pomodoro";
    } catch {
      return "pomodoro";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("gamify-timer-view", view);
    } catch {
      // Ignore storage failures in private browsing or restricted environments.
    }
  }, [view]);

  useEffect(() => {
    if (lockInRequest > 0) setView("pomodoro");
  }, [lockInRequest]);

  return (
    <div className="space-y-4">
      <Panel className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelHeader title="Lock In" />
          <div className="inline-flex rounded-lg border border-white/10 bg-ink/60 p-1 text-sm">
            <button
              className={`rounded-md px-3 py-2 transition ${view === "pomodoro" ? "bg-jade text-ink" : "text-slate-300 hover:bg-white/5"}`}
              onClick={() => setView("pomodoro")}
            >
              Pomodoro
            </button>
            <button
              className={`rounded-md px-3 py-2 transition ${view === "rpg" ? "bg-jade text-ink" : "text-slate-300 hover:bg-white/5"}`}
              onClick={() => setView("rpg")}
            >
              RPG Timer
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Pomodoro mode mirrors the familiar work / short break / long break flow and keeps task estimates, settings, and progress in the app database.
        </p>
      </Panel>
      {view === "pomodoro" ? (
        <PomodoroTimer state={state} refresh={refresh} triggerReward={triggerReward} lockInRequest={lockInRequest} />
      ) : (
        <RpgTimer refresh={refresh} triggerReward={triggerReward} />
      )}
    </div>
  );
}

function RpgTimer({ refresh, triggerReward }: { refresh: () => Promise<void>; triggerReward: () => void }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState("General");
  const [mode, setMode] = useState("focus");
  const elapsedMinutes = Math.max(1, Math.round((25 * 60 - seconds) / 60));

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (seconds === 0 && running) setRunning(false);
  }, [seconds, running]);

  const logSession = async () => {
    await api.createSession({ subject, mode, minutes: seconds === 0 ? 25 : elapsedMinutes });
    triggerReward();
    setSeconds(25 * 60);
    setRunning(false);
    await refresh();
  };

  return (
    <Panel className="mx-auto max-w-3xl text-center">
      <PanelHeader title="Focus Chamber" />
      <div className="mx-auto my-8 grid h-64 w-64 place-items-center rounded-full border border-jade/25 bg-jade/8 shadow-glow">
        <div>
          <Hourglass className="mx-auto mb-3 text-jade" />
          <div className="text-7xl font-black tabular-nums text-white">{formatTime(seconds)}</div>
          <p className="mt-2 text-sm text-slate-400">{mode.replace("_", " ")}</p>
        </div>
      </div>
      <Progress value={25 * 60 - seconds} max={25 * 60} tone="jade" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="focus">25 min focus</option>
          <option value="practice">Practice questions</option>
          <option value="deep_work">Deep work</option>
        </Select>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => setRunning(!running)}>{running ? "Pause" : "Start"}</Button>
        <Button variant="ghost" onClick={() => setSeconds(25 * 60)}>Reset</Button>
        <Button variant="ghost" onClick={logSession}>Log Session</Button>
      </div>
    </Panel>
  );
}

function PomodoroTimer({ state, refresh, triggerReward, lockInRequest }: { state: DashboardState; refresh: () => Promise<void>; triggerReward: () => void; lockInRequest: number }) {
  const board = state.pomodoro;
  const settings = board.settings;
  const [phase, setPhase] = useState<PomodoroPhase>("pomodoro");
  const [seconds, setSeconds] = useState(settings.work_minutes * 60);
  const [running, setRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [lockInOpen, setLockInOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("General");
  const [taskEstimate, setTaskEstimate] = useState(1);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const currentTask = board.tasks.find((task) => task.id === board.stats.active_task_id) ?? null;
  const phaseMinutes = durationForPhase(phase, settings);
  const phaseLabelText = phaseLabel(phase);

  useEffect(() => {
    if (!running) setSeconds(phaseMinutes * 60);
  }, [phaseMinutes, running]);

  useEffect(() => {
    if (showSettings) setSettingsDraft(settings);
  }, [showSettings, settings]);

  useEffect(() => {
    if (lockInRequest > 0) {
      void enterDeviceFullscreen();
      setLockInOpen(true);
    }
  }, [lockInRequest]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (seconds !== 0 || !running) return;
    void finishPhase();
  }, [seconds, running, phase, cycleCount, settings.auto_start_breaks, settings.auto_start_pomodoros, settings.sessions_before_long_break, settings.sound_enabled, settings.work_minutes, settings.short_break_minutes, settings.long_break_minutes, currentTask]);

  const finishPhase = async () => {
    setRunning(false);
    ping(settings.sound_enabled);
    if (phase === "pomodoro") {
      triggerReward();
      await api.createSession({
        subject: currentTask?.subject ?? "General",
        mode: "pomodoro",
        minutes: settings.work_minutes
      });
      if (currentTask) {
        await api.advancePomodoroTask(currentTask.id, { amount: 1 });
      }
      const nextCycle = cycleCount + 1;
      setCycleCount(nextCycle);
      const nextPhase: PomodoroPhase = nextCycle % settings.sessions_before_long_break === 0 ? "long_break" : "short_break";
      setPhase(nextPhase);
      setSeconds(durationForPhase(nextPhase, settings) * 60);
      if (settings.auto_start_breaks) setRunning(true);
      await refresh();
      return;
    }
    setPhase("pomodoro");
    setSeconds(settings.work_minutes * 60);
    if (settings.auto_start_pomodoros) setRunning(true);
    await refresh();
  };

  const startPause = () => {
    if (!running && seconds === 0) setSeconds(durationForPhase(phase, settings) * 60);
    setRunning((value) => !value);
  };

  const reset = () => {
    setSeconds(durationForPhase(phase, settings) * 60);
    setRunning(false);
  };

  const switchPhase = (next: PomodoroPhase) => {
    setPhase(next);
    setSeconds(durationForPhase(next, settings) * 60);
    setRunning(false);
  };

  const saveSettings = async (payload: Record<string, unknown>) => {
    await api.pomodoroSettings(payload);
    setShowSettings(false);
    await refresh();
    setSeconds(durationForPhase(phase, settingsDraft) * 60);
  };

  const saveDraftSettings = async () => {
    await saveSettings({
      work_minutes: settingsDraft.work_minutes,
      short_break_minutes: settingsDraft.short_break_minutes,
      long_break_minutes: settingsDraft.long_break_minutes,
      sessions_before_long_break: settingsDraft.sessions_before_long_break,
      auto_start_breaks: settingsDraft.auto_start_breaks,
      auto_start_pomodoros: settingsDraft.auto_start_pomodoros,
      sound_enabled: settingsDraft.sound_enabled
    });
  };

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    await api.createPomodoroTask({ title: taskTitle, subject: taskSubject, estimated_pomodoros: taskEstimate });
    setTaskTitle("");
    setTaskSubject("General");
    setTaskEstimate(1);
    await refresh();
  };

  const completeTask = async (task: PomodoroTask) => {
    await api.updatePomodoroTask(task.id, { completed: true, completed_pomodoros: task.estimated_pomodoros });
    await refresh();
  };

  const editTask = async (task: PomodoroTask, payload: Record<string, unknown>) => {
    await api.updatePomodoroTask(task.id, payload);
    setEditingTaskId(null);
    await refresh();
  };

  const estimateText = formatDuration(board.stats.estimated_finish_minutes);
  const openLockInMode = () => {
    void enterDeviceFullscreen();
    setLockInOpen(true);
  };
  const closeLockInMode = () => {
    setLockInOpen(false);
    void exitDeviceFullscreen();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <Panel className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-jade via-gold to-rune" />
        <PanelHeader title="Pomodoro Board" action={<Badge tone={phase === "pomodoro" ? "easy" : "boss"}>{phaseLabelText}</Badge>} />
        <div className="grid gap-5">
          <div className="mx-auto grid h-56 w-56 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-panel via-midnight to-ink shadow-glow sm:h-64 sm:w-64 lg:h-72 lg:w-72">
            <div className="text-center">
              <Hourglass className="mx-auto mb-3 text-jade" size={26} />
              <div className="text-5xl font-black tabular-nums !text-white sm:text-6xl lg:text-7xl">{formatTime(seconds)}</div>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400 sm:text-sm">{phaseLabelText}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <QuickStat label="Work today" value={board.stats.work_sessions_today.toString()} />
            <QuickStat label="Left" value={board.stats.remaining_pomodoros.toString()} />
            <QuickStat label="ETA" value={estimateText} />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-lg border border-white/10 bg-ink/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current focus</p>
              <h3 className="mt-2 text-lg font-black text-white">{currentTask?.title ?? "No task selected"}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {currentTask ? `${currentTask.subject} · ${currentTask.remaining_pomodoros} pomodoros remaining` : "Pick a task to connect work blocks to the queue."}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-ink/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cycle</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-3xl font-black text-white">{cycleCount + 1}</p>
                <p className="text-xs text-slate-400">Long break every {settings.sessions_before_long_break}</p>
              </div>
            </div>
          </div>

          <Progress value={seconds === 0 ? 0 : phaseMinutes * 60 - seconds} max={phaseMinutes * 60} tone={phase === "pomodoro" ? "jade" : phase === "short_break" ? "gold" : "rune"} />

          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={startPause}>{running ? <Pause size={16} /> : <Play size={16} />} {running ? "Pause" : "Start"}</Button>
            <Button variant="ghost" onClick={openLockInMode}>
              <Maximize2 size={16} /> Lock in mode
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RefreshCcw size={16} /> Reset
            </Button>
            <Button variant="ghost" onClick={() => switchPhase("pomodoro")}>
              Pomodoro
            </Button>
            <Button variant="ghost" onClick={() => switchPhase("short_break")}>
              Short break
            </Button>
            <Button variant="ghost" onClick={() => switchPhase("long_break")}>
              Long break
            </Button>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <PanelHeader title="Task Queue" />
            <Button variant="ghost" onClick={() => setShowSettings(true)}>
              <Settings size={16} /> Settings
            </Button>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1.2fr_.7fr_.6fr_auto]" onSubmit={addTask}>
            <Field value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
            <Field value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)} placeholder="Subject" />
            <Field type="number" min={1} value={taskEstimate} onChange={(e) => setTaskEstimate(Number(e.target.value))} />
            <Button type="submit" className="sm:min-w-28">
              <Plus size={16} /> Add
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {board.tasks.length === 0 && <EmptyState icon={<TargetIcon size={18} />} title="No tasks yet" body="Add a task and estimate how many pomodoros it needs." />}
            {board.tasks.map((task) => (
              <PomodoroTaskRow
                key={task.id}
                task={task}
                active={task.id === board.stats.active_task_id}
                editing={editingTaskId === task.id}
                onActivate={async () => {
                  await api.activatePomodoroTask(task.id);
                  await refresh();
                }}
                onDelete={async () => {
                  await api.deletePomodoroTask(task.id);
                  await refresh();
                }}
                onComplete={async () => {
                  await completeTask(task);
                }}
                onBeginEdit={() => setEditingTaskId(task.id)}
                onCancelEdit={() => setEditingTaskId(null)}
                onSave={editTask}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Pomofocus Settings" action={<span className="text-xs text-slate-400">Stored in the database</span>} />
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <SettingPill label="Work" value={`${settings.work_minutes} min`} />
              <SettingPill label="Short break" value={`${settings.short_break_minutes} min`} />
              <SettingPill label="Long break" value={`${settings.long_break_minutes} min`} />
              <SettingPill label="Long interval" value={`${settings.sessions_before_long_break} sessions`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TogglePill label="Auto start breaks" active={settings.auto_start_breaks} />
              <TogglePill label="Auto start pomodoros" active={settings.auto_start_pomodoros} />
              <TogglePill label="Sound alerts" active={settings.sound_enabled} />
              <TogglePill label="Active task" active={Boolean(currentTask)} />
            </div>
          </div>
        </Panel>
      </div>

      <AnimatePresence>
        {lockInOpen && (
          <LockInOverlay
            state={state}
            phaseLabelText={phaseLabelText}
            seconds={seconds}
            running={running}
            currentTask={currentTask}
            onClose={closeLockInMode}
          />
        )}
        {showSettings && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} className="w-full max-w-xl rounded-lg border border-white/10 bg-midnight p-5 shadow-glow">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-black text-white">Pomodoro settings</h3>
                <Button variant="ghost" onClick={() => setShowSettings(false)}>
                  <X size={16} />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field type="number" min={1} value={settingsDraft.work_minutes} onChange={(e) => setSettingsDraft({ ...settingsDraft, work_minutes: Number(e.target.value) })} />
                <Field type="number" min={1} value={settingsDraft.short_break_minutes} onChange={(e) => setSettingsDraft({ ...settingsDraft, short_break_minutes: Number(e.target.value) })} />
                <Field type="number" min={1} value={settingsDraft.long_break_minutes} onChange={(e) => setSettingsDraft({ ...settingsDraft, long_break_minutes: Number(e.target.value) })} />
                <Field type="number" min={1} value={settingsDraft.sessions_before_long_break} onChange={(e) => setSettingsDraft({ ...settingsDraft, sessions_before_long_break: Number(e.target.value) })} />
              </div>
              <p className="mt-3 text-xs text-slate-500">Use the quick controls below to save your preferred timer presets.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button onClick={() => void saveDraftSettings()}>Save</Button>
                <Button variant="ghost" onClick={() => setSettingsDraft({ ...settingsDraft, work_minutes: 25, short_break_minutes: 5, long_break_minutes: 15, sessions_before_long_break: 4 })}>Pomodoro classic</Button>
                <Button variant="ghost" onClick={() => setSettingsDraft({ ...settingsDraft, work_minutes: 50, short_break_minutes: 10, long_break_minutes: 20, sessions_before_long_break: 4 })}>Deep work</Button>
                <Button variant="ghost" onClick={() => setSettingsDraft({ ...settingsDraft, auto_start_breaks: !settingsDraft.auto_start_breaks })}>Auto start breaks {settingsDraft.auto_start_breaks ? "on" : "off"}</Button>
                <Button variant="ghost" onClick={() => setSettingsDraft({ ...settingsDraft, auto_start_pomodoros: !settingsDraft.auto_start_pomodoros })}>Auto start pomodoros {settingsDraft.auto_start_pomodoros ? "on" : "off"}</Button>
                <Button variant="ghost" onClick={() => setSettingsDraft({ ...settingsDraft, sound_enabled: !settingsDraft.sound_enabled })}>Sound {settingsDraft.sound_enabled ? "on" : "off"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LockInOverlay({
  state,
  phaseLabelText,
  seconds,
  running,
  currentTask,
  onClose
}: {
  state: DashboardState;
  phaseLabelText: string;
  seconds: number;
  running: boolean;
  currentTask: PomodoroTask | null;
  onClose: () => void;
}) {
  const profile = state.profile;
  const fullscreenRequestedRef = useRef(false);
  const mediaUrl = profile.lock_media_url?.trim();
  const mediaPosition = profile.lock_media_position || "right";
  const showMedia = Boolean(mediaUrl) && mediaPosition !== "hidden";
  const media = showMedia ? <LockInMedia url={mediaUrl} background={mediaPosition === "background"} /> : null;

  useEffect(() => {
    let mounted = true;
    void enterDeviceFullscreen().then((entered) => {
      if (mounted) fullscreenRequestedRef.current = entered;
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const handleFullscreenChange = () => {
      if (fullscreenRequestedRef.current && !fullscreenElement()) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      mounted = false;
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [onClose]);

  const content = (
    <div className="relative z-10 grid min-h-0 gap-6 p-6 text-white sm:p-10">
      <div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Lock in</p>
          <h2 className="mt-1 text-2xl font-black sm:text-4xl">{running ? phaseLabelText : "Ready when you are"}</h2>
        </div>
      </div>

      {profile.lock_show_timer && (
        <div className="grid place-items-center py-6">
          <div className="grid h-64 w-64 place-items-center rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_80px_rgba(139,124,246,0.2)] sm:h-80 sm:w-80">
            <div className="text-center">
              <Hourglass className="mx-auto mb-4 text-violet-300" size={34} />
              <div className="text-6xl font-black tabular-nums sm:text-8xl">{running ? formatTime(seconds) : "00:00"}</div>
              <p className="mt-3 text-sm uppercase tracking-[0.2em] text-white/50">{running ? phaseLabelText : "No timer running"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {profile.lock_show_stats && (
          <>
            <LockInStat label="Level" value={String(profile.level)} />
            <LockInStat label="XP" value={String(profile.xp)} />
            <LockInStat label="Streak" value={`${profile.current_streak}d`} />
          </>
        )}
      </div>

      {profile.lock_show_tasks && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Current task</p>
          <h3 className="mt-2 text-xl font-black">{currentTask?.title ?? "No task selected"}</h3>
          <p className="mt-1 text-sm text-white/55">{currentTask ? `${currentTask.subject} - ${currentTask.remaining_pomodoros} pomodoros left` : "Start or select a task from the timer queue."}</p>
        </div>
      )}

      {profile.lock_show_quote && (
        <p className="max-w-2xl text-sm leading-6 text-white/55">{state.quote.body}</p>
      )}
    </div>
  );

  const layoutClass =
    mediaPosition === "left"
      ? "lg:grid-cols-[0.85fr_1.15fr]"
      : mediaPosition === "top" || mediaPosition === "bottom"
        ? "grid-rows-[auto_1fr]"
        : "lg:grid-cols-[1.15fr_0.85fr]";

  return (
    <motion.div className="fixed inset-0 z-[80] overflow-y-auto bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button
        type="button"
        aria-label="Exit lock in"
        onClick={onClose}
        className="fixed right-4 top-4 z-[90] grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/10 text-white shadow-[0_16px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-white/18 focus:outline-none focus:ring-4 focus:ring-violet-400/30"
      >
        <X size={22} />
      </button>
      {mediaPosition === "background" && media}
      <div className={`relative mx-auto grid min-h-screen max-w-7xl ${showMedia && mediaPosition !== "background" ? layoutClass : ""}`}>
        {showMedia && mediaPosition === "left" && <div className="min-h-64 p-4 lg:min-h-screen">{media}</div>}
        {showMedia && mediaPosition === "top" && <div className="min-h-64 p-4">{media}</div>}
        {content}
        {showMedia && mediaPosition === "right" && <div className="min-h-64 p-4 lg:min-h-screen">{media}</div>}
        {showMedia && mediaPosition === "bottom" && <div className="min-h-64 p-4">{media}</div>}
      </div>
    </motion.div>
  );
}

function LockInMedia({ url, background = false }: { url: string; background?: boolean }) {
  const isVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
  const className = background
    ? "absolute inset-0 h-full w-full object-cover opacity-25"
    : "h-full min-h-64 w-full rounded-2xl border border-white/10 object-cover";
  if (isVideo) {
    return <video src={url} className={className} autoPlay muted loop playsInline />;
  }
  return <img src={url} alt="" className={className} />;
}

function LockInStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function PomodoroTaskRow({
  task,
  active,
  editing,
  onActivate,
  onDelete,
  onComplete,
  onBeginEdit,
  onCancelEdit,
  onSave
}: {
  task: PomodoroTask;
  active: boolean;
  editing: boolean;
  onActivate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onComplete: () => Promise<void>;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSave: (task: PomodoroTask, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [subject, setSubject] = useState(task.subject);
  const [estimate, setEstimate] = useState(task.estimated_pomodoros);

  useEffect(() => {
    setTitle(task.title);
    setSubject(task.subject);
    setEstimate(task.estimated_pomodoros);
  }, [task.title, task.subject, task.estimated_pomodoros]);

  if (editing) {
    return (
      <div className="rounded-lg border border-gold/25 bg-gold/8 p-3">
        <div className="grid gap-2 sm:grid-cols-[1.2fr_.8fr_.5fr]">
          <Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          <Field value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <Field type="number" min={1} value={estimate} onChange={(e) => setEstimate(Number(e.target.value))} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void onSave(task, { title, subject, estimated_pomodoros: estimate })}>Save</Button>
          <Button variant="ghost" onClick={onCancelEdit}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${active ? "border-jade/40 bg-jade/10" : "border-white/10 bg-ink/50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-bold text-white">{task.title}</h4>
            {active && <Badge tone="easy">Current</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{task.subject} · {task.completed_pomodoros}/{task.estimated_pomodoros} pomodoros</p>
          <Progress value={task.completed_pomodoros} max={Math.max(1, task.estimated_pomodoros)} tone={active ? "jade" : "gold"} />
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="ghost" aria-label={`Activate ${task.title}`} onClick={() => void onActivate()}><TargetIcon size={14} /></Button>
          <Button variant="ghost" aria-label={`Edit ${task.title}`} onClick={onBeginEdit}><Settings size={14} /></Button>
          <Button variant="ghost" aria-label={`Complete ${task.title}`} onClick={() => void onComplete()}><CheckCircle2 size={14} /></Button>
          <Button variant="ghost" aria-label={`Delete ${task.title}`} onClick={() => void onDelete()}><X size={14} /></Button>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink/55 p-4 text-center">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function SettingPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink/55 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-white">{value}</p>
    </div>
  );
}

function TogglePill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${active ? "border-jade/25 bg-jade/10" : "border-white/10 bg-ink/55"}`}>
      <p className="text-base font-bold text-white">{label}</p>
      <p className="mt-1 text-sm text-slate-400">{active ? "Enabled" : "Disabled"}</p>
    </div>
  );
}

function ToggleControl({ label, active, onChange }: { label: string; active: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex min-h-12 items-center justify-between rounded-lg border p-3.5 ${active ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"}`}>
      <span className="text-sm font-bold text-slate-800">{label}</span>
      <input className="h-6 w-6 rounded border-slate-300 accent-violet-600" type="checkbox" checked={active} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function durationForPhase(phase: PomodoroPhase, settings: PomodoroBoard["settings"]) {
  if (phase === "short_break") return settings.short_break_minutes;
  if (phase === "long_break") return settings.long_break_minutes;
  return settings.work_minutes;
}

function phaseLabel(phase: PomodoroPhase) {
  if (phase === "short_break") return "Short break";
  if (phase === "long_break") return "Long break";
  return "Pomodoro";
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function ping(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  const AudioContext = window.AudioContext || (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 784;
  gain.gain.value = 0.06;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.14);
}

function Bosses({ state, refresh, completeWithReward }: { state: DashboardState; refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", subject: "General", exam_date: today, duration_minutes: 60, difficulty: "boss", topics: "" });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.createBoss({ ...form, topics: form.topics.split("\n").map((topic) => topic.trim()).filter(Boolean) });
    setForm({ ...form, title: "", topics: "" });
    await refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <Panel>
        <PanelHeader title="Forge Boss Fight" />
        <form className="space-y-3" onSubmit={submit}>
          <Field required placeholder="Exam or challenge name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Field value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Field type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
            <Field type="number" min={15} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
          </div>
          <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="boss">Boss</option>
          </Select>
          <TextArea placeholder="Topics, one per line" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />
          <Button type="submit"><Swords size={16} /> Create</Button>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Boss Arena" />
        <div className="grid gap-3">
          {state.bosses.map((boss) => <BossCard key={boss.id} boss={boss} completeWithReward={completeWithReward} />)}
        </div>
      </Panel>
    </div>
  );
}

function CalendarView({ state, refresh }: { state: DashboardState; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState("Study block");
  const [startsAt, setStartsAt] = useState(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await api.createStudyBlock({ title, starts_at: start.toISOString(), ends_at: end.toISOString() });
    await refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
      <Panel>
        <PanelHeader title="Create Study Block" />
        <form className="space-y-3" onSubmit={submit}>
          <Field value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <Button type="submit"><CalendarDays size={16} /> Add Block</Button>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Timeline Preview" />
        <Timeline events={state.events} />
      </Panel>
    </div>
  );
}

function TickTick({ state, refresh, completeWithReward }: { state: DashboardState; refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  const ticktick = state.integrations.ticktick;
  const [intel, setIntel] = useState<IntegrationIntelligence | null>(null);
  const loadIntel = async () => setIntel(await api.integrationIntelligence());
  useEffect(() => {
    void loadIntel();
    const handler = () => void loadIntel();
    window.addEventListener("ticktick-updated", handler);
    return () => window.removeEventListener("ticktick-updated", handler);
  }, []);
  return (
    <Panel>
      <PanelHeader title="TickTick Command Board" />
      <IntegrationStatusCard status={ticktick} />
      <div className="mt-4 flex flex-wrap gap-2">
        {ticktick.auth_url && <Button onClick={() => window.open(ticktick.auth_url!, "_blank")}>Connect TickTick</Button>}
        <Button variant="ghost" onClick={async () => { await api.syncTickTick(); await refresh(); await loadIntel(); }}>
          <RefreshCcw size={16} /> Sync Tasks
        </Button>
      </div>
      <div className="mt-5">
        {intel && (
          <div className="mb-5">
            <PanelHeader title="Next 7 Days" />
            <NextSevenDaysTasks tasks={intel.ticktick.projects.flatMap((project) => project.tasks.map((task) => ({ ...task, project_name: project.name })))} />
          </div>
        )}
        <EnhancedQuestBoard quests={state.quests.filter((quest) => quest.external_source === "ticktick" || !quest.completed)} completeWithReward={completeWithReward} />
      </div>
    </Panel>
  );
}

function Stats({ state }: { state: DashboardState }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Study Consistency" />
        <Heatmap heatmap={state.heatmap} />
      </Panel>
      <Panel>
        <PanelHeader title="Rank Progression" />
        <RankPath ranks={state.ranks} />
      </Panel>
      <Panel>
        <PanelHeader title="Subject Mastery" />
        <MasteryCards mastery={state.mastery} />
      </Panel>
      <Panel>
        <PanelHeader title="Achievements" />
        <AchievementGrid achievements={state.locked_achievements} />
      </Panel>
      <Panel className="lg:col-span-2">
        <PanelHeader title="Session History" />
        <SessionList sessions={state.sessions} />
      </Panel>
    </div>
  );
}

function SettingsPage({ state, refresh }: { state: DashboardState; refresh: () => Promise<void> }) {
  const [name, setName] = useState(state.profile.display_name);
  const [dailyGoal, setDailyGoal] = useState(state.profile.daily_xp_goal);
  const [weeklyGoal, setWeeklyGoal] = useState(state.profile.weekly_xp_goal);
  const [shrivaishnavaMode, setShrivaishnavaMode] = useState(state.profile.shrivaishnava_mode);
  const [lockMediaUrl, setLockMediaUrl] = useState(state.profile.lock_media_url ?? "");
  const [lockMediaPosition, setLockMediaPosition] = useState(state.profile.lock_media_position ?? "right");
  const [lockShowTimer, setLockShowTimer] = useState(state.profile.lock_show_timer);
  const [lockShowStats, setLockShowStats] = useState(state.profile.lock_show_stats);
  const [lockShowTasks, setLockShowTasks] = useState(state.profile.lock_show_tasks);
  const [lockShowQuote, setLockShowQuote] = useState(state.profile.lock_show_quote);
  const [deployment, setDeployment] = useState<DeploymentConfig | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const google = state.integrations.google_calendar;
  const ticktick = state.integrations.ticktick;
  const database = health?.database as { ok?: boolean; url_scheme?: string; error?: string | null } | undefined;
  useEffect(() => {
    void api.deploymentConfig().then(setDeployment).catch(() => setDeployment(null));
    void api.health().then(setHealth).catch(() => setHealth(null));
  }, []);
  const save = async () => {
    await api.updateSettings({
      display_name: name,
      shrivaishnava_mode: shrivaishnavaMode,
      daily_xp_goal: dailyGoal,
      weekly_xp_goal: weeklyGoal,
      lock_media_url: lockMediaUrl,
      lock_media_position: lockMediaPosition,
      lock_show_timer: lockShowTimer,
      lock_show_stats: lockShowStats,
      lock_show_tasks: lockShowTasks,
      lock_show_quote: lockShowQuote
    });
    await refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Profile & Goals" />
        <div className="space-y-3">
          <Field value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Field type="number" value={dailyGoal} onChange={(e) => setDailyGoal(Number(e.target.value))} />
            <Field type="number" value={weeklyGoal} onChange={(e) => setWeeklyGoal(Number(e.target.value))} />
          </div>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
            <span className="font-semibold text-slate-700">Shrivaishnava mode</span>
            <input className="h-6 w-6 rounded border-slate-300 accent-violet-600" type="checkbox" checked={shrivaishnavaMode} onChange={(e) => setShrivaishnavaMode(e.target.checked)} />
          </label>
          <Button onClick={save}>Save profile</Button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Lock In Screen" />
        <div className="space-y-3 text-sm">
          <Field placeholder="Media URL for focus screen" value={lockMediaUrl} onChange={(e) => setLockMediaUrl(e.target.value)} />
          <Select value={lockMediaPosition} onChange={(e) => setLockMediaPosition(e.target.value)}>
            <option value="right">Media right</option>
            <option value="left">Media left</option>
            <option value="top">Media top</option>
            <option value="bottom">Media bottom</option>
            <option value="background">Media background</option>
            <option value="hidden">Hide media</option>
          </Select>
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleControl label="Timer" active={lockShowTimer} onChange={setLockShowTimer} />
            <ToggleControl label="Stats" active={lockShowStats} onChange={setLockShowStats} />
            <ToggleControl label="Task" active={lockShowTasks} onChange={setLockShowTasks} />
            <ToggleControl label="Quote" active={lockShowQuote} onChange={setLockShowQuote} />
          </div>
          <Button onClick={save}>Save lock-in screen</Button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Data Storage" />
        <div className="grid gap-3 text-sm">
          <ConfigRow label="Study data location" value={storageLabel(database?.url_scheme)} />
          <ConfigRow label="Database status" value={database?.ok ? "Connected and saving" : database?.error ? `Issue: ${database.error}` : "Checking..."} />
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
            <p className="font-bold text-slate-900">Your quests, XP, streaks, sessions, bosses, imported tasks, calendar events, and settings are saved by the backend database.</p>
            <p className="mt-2 text-slate-600">Clearing browser cache may log you out of future account features, but it will not erase the hosted study data stored in Railway/PostgreSQL.</p>
          </div>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Deployment Status" />
        <div className="space-y-3 text-sm">
          <ConfigRow label="Frontend API base" value={apiBaseUrl} />
          <ConfigRow label="Backend public URL" value={deployment?.backend_url ?? "Not reported yet"} />
          <ConfigRow label="Health" value={health ? String(health.status ?? "unknown") : "Not checked yet"} />
          <ConfigRow label="TickTick redirect URI" value={deployment?.ticktick_redirect_uri ?? "Not reported yet"} />
          <ConfigRow label="Google redirect URI" value={deployment?.google_redirect_uri ?? "Not reported yet"} />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="TickTick" />
        <IntegrationStatusCard status={ticktick} />
        <div className="mt-4 flex flex-wrap gap-2">
          {ticktick.auth_url ? <Button onClick={() => window.open(ticktick.auth_url!, "_blank")}>Connect TickTick</Button> : <Button disabled variant="ghost">Not connected yet</Button>}
          <Button variant="ghost" onClick={async () => { await api.syncTickTick(); await refresh(); }}>Sync Fallback</Button>
        </div>
      </Panel>
      <Panel className="lg:col-span-2">
        <PanelHeader title="Google Calendar" />
        <IntegrationStatusCard status={google} />
        <div className="mt-4 flex flex-wrap gap-2">
          {google.auth_url ? <Button onClick={() => window.open(google.auth_url!, "_blank")}>Connect Google</Button> : <Button disabled variant="ghost">Not connected yet</Button>}
          <Button variant="ghost" onClick={async () => { await api.syncGoogle(); await refresh(); }}>Sync Calendar</Button>
        </div>
      </Panel>
    </div>
  );
}

function NextActionCard({ quest, completeWithReward }: { quest: Quest | null; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  if (!quest) {
    return (
      <div className="mb-3 rounded-lg border border-dashed border-white/15 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <Brain className="text-jade" />
          <div>
            <h3 className="font-black text-white">No active quest selected</h3>
            <p className="text-sm text-slate-400">Add one small task to start a chain.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <motion.div layout className="focus-pulse mb-3 overflow-hidden rounded-lg border border-jade/25 bg-gradient-to-r from-jade/12 via-panel2/70 to-rune/12 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade">Recommended now</p>
          <h3 className="mt-1 font-black text-white">{quest.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{quest.subject} - {questDueLabel(quest)} - {quest.xp_reward} XP</p>
        </div>
        <Button onClick={() => completeWithReward(() => api.completeQuest(quest.id).then(() => undefined), quest.difficulty === "hard" || quest.difficulty === "boss")}>
          <Check size={16} /> Claim
        </Button>
      </div>
    </motion.div>
  );
}

function EnhancedQuestBoard({ quests, completeWithReward }: { quests: Quest[]; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  if (quests.length === 0) return <EmptyState icon={<ListChecks />} title="No quests yet" body="Create one manual quest or sync TickTick to fill the board." />;
  return (
    <div className="grid gap-3">
      {quests.map((quest, index) => (
        <motion.div
          key={quest.id}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2, scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
          transition={{ delay: index * 0.025 }}
          className={`quest-card relative overflow-hidden rounded-lg border bg-gradient-to-br from-ink/85 to-panel2/45 p-4 ${quest.completed ? "border-white/8 opacity-60" : questBorder(quest.difficulty)}`}
        >
          <div className={`absolute bottom-0 left-0 top-0 w-1 ${questAccent(quest.difficulty)}`} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 pl-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={quest.completed ? "font-black text-slate-500 line-through" : "font-black text-white"}>{quest.title}</h3>
                <Badge tone={quest.difficulty}>{quest.difficulty}</Badge>
                <span className="rounded border border-gold/30 bg-gold/12 px-2 py-1 text-xs font-bold text-gold">{quest.xp_reward} XP</span>
                {quest.external_source && <span className="rounded border border-rune/30 bg-rune/15 px-2 py-1 text-xs text-violet-200">{quest.external_source}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-400">{quest.subject} - {quest.type} - {questDueLabel(quest)}</p>
            </div>
            <Button className="shrink-0" disabled={quest.completed} onClick={() => completeWithReward(() => api.completeQuest(quest.id).then(() => undefined), quest.difficulty === "hard" || quest.difficulty === "boss")}>
              <Check size={16} /> {quest.completed ? "Done" : "Claim"}
            </Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function QuestBoard({ quests, completeWithReward }: { quests: Quest[]; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  if (quests.length === 0) return <EmptyState icon={<ListChecks />} title="No quests yet" body="Create one manual quest or sync TickTick to fill the board." />;
  return (
    <div className="grid gap-3">
      {quests.map((quest, index) => (
        <motion.div
          key={quest.id}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2, scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
          transition={{ delay: index * 0.025 }}
          className={`quest-card relative overflow-hidden rounded-lg border bg-gradient-to-br from-ink/85 to-panel2/45 p-4 ${quest.completed ? "border-white/8 opacity-60" : questBorder(quest.difficulty)}`}
        >
          <div className={`absolute bottom-0 left-0 top-0 w-1 ${questAccent(quest.difficulty)}`} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={quest.completed ? "font-black text-slate-500 line-through" : "font-black text-white"}>{quest.title}</h3>
                <Badge tone={quest.difficulty}>{quest.difficulty}</Badge>
                <span className="rounded border border-gold/30 bg-gold/12 px-2 py-1 text-xs font-bold text-gold">{quest.xp_reward} XP</span>
                {quest.external_source && <span className="rounded border border-rune/30 bg-rune/15 px-2 py-1 text-xs text-violet-200">{quest.external_source}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-400">{quest.subject} · {quest.type} {quest.due_date ? `· due ${quest.due_date}` : ""}</p>
            </div>
            <Button disabled={quest.completed} onClick={() => completeWithReward(() => api.completeQuest(quest.id).then(() => undefined), quest.difficulty === "hard" || quest.difficulty === "boss")}>
              <Check size={16} /> Complete
            </Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BossCard({ boss, completeWithReward }: { boss: BossFight; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void> }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-lg border border-rune/30 bg-gradient-to-br from-rune/16 to-ink/80 p-4 shadow-glow">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Swords className="text-rune" size={18} />
            <h3 className="font-black text-white">{boss.title}</h3>
            <Badge tone={boss.difficulty}>{boss.difficulty}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">{boss.subject} · {boss.duration_minutes} min · {boss.exam_date ?? "no exam date"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {boss.topics.map((topic) => <span key={topic} className="rounded bg-white/8 px-2 py-1 text-xs text-slate-200">{topic}</span>)}
          </div>
        </div>
        <Button disabled={boss.completed} onClick={() => completeWithReward(() => api.completeBoss(boss.id).then(() => undefined), true)}>
          <Trophy size={16} /> {boss.completed ? "Cleared" : "Clear +200 XP"}
        </Button>
      </div>
    </motion.div>
  );
}

function Timeline({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">No calendar blocks yet.</p>;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="relative border-l border-white/10 pl-4">
          <div className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${event.is_study_block ? "bg-jade shadow-glow" : "bg-slate-500"}`} />
          <div className="rounded-lg bg-ink/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-white">{event.title}</h3>
              <div className="flex gap-2">
                {event.external_source && <span className="rounded bg-rune/15 px-2 py-1 text-xs text-violet-200">{event.external_source}</span>}
                {event.is_study_block && <span className="rounded bg-jade/15 px-2 py-1 text-xs text-teal-200">study</span>}
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-400">{new Date(event.starts_at).toLocaleString()} - {new Date(event.ends_at).toLocaleTimeString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionList({ sessions }: { sessions: StudySession[] }) {
  if (sessions.length === 0) return <p className="text-sm text-slate-400">No sessions logged yet.</p>;
  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div key={session.id} className="flex justify-between gap-3 rounded-lg border border-white/10 bg-ink/50 p-3">
          <div>
            <h3 className="font-bold text-white">{session.subject}</h3>
            <p className="text-sm text-slate-400">{session.minutes} min · {session.mode.replace("_", " ")} · {new Date(session.created_at).toLocaleString()}</p>
          </div>
          <span className="font-black text-gold">{session.xp_awarded} XP</span>
        </div>
      ))}
    </div>
  );
}

function MasteryCards({ mastery }: { mastery: DashboardState["mastery"] }) {
  if (mastery.length === 0) return <p className="text-sm text-slate-400">Complete quests or sessions to build mastery.</p>;
  const max = Math.max(...mastery.map((item) => item.points), 10);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {mastery.map((item) => {
        const percentage = Math.min(100, Math.round((item.points / max) * 100));
        return (
          <div key={item.subject} className="rounded-lg border border-white/10 bg-ink/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-black text-white">{item.subject}</h3>
              <span className="text-sm font-bold text-jade">{percentage}%</span>
            </div>
            <Progress value={percentage} max={100} tone="rune" />
            <p className="mt-2 text-xs text-slate-400">{item.points} mastery points</p>
          </div>
        );
      })}
    </div>
  );
}

function AchievementGrid({ achievements }: { achievements: DashboardState["locked_achievements"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {achievements.map((achievement) => (
        <div key={achievement.key} className={`rounded-lg border p-3 ${achievement.unlocked ? "border-gold/35 bg-gold/10" : "border-white/10 bg-ink/45 opacity-70"}`}>
          <div className="mb-2 flex items-center gap-2">
            {achievement.unlocked ? <Award className="text-gold" size={18} /> : <Lock className="text-slate-500" size={18} />}
            <h3 className="font-black text-white">{achievement.title}</h3>
          </div>
          <p className="text-sm text-slate-400">{achievement.description}</p>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ heatmap }: { heatmap: DashboardState["heatmap"] }) {
  const byDate = new Map(heatmap.map((day) => [day.date, day.xp]));
  const days = Array.from({ length: 70 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (69 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, xp: byDate.get(key) ?? 0 };
  });
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
      {days.map((day) => {
        const intensity = Math.min(1, day.xp / 150);
        return <div key={day.date} title={`${day.date}: ${day.xp} XP`} className="aspect-square rounded-sm border border-white/5" style={{ backgroundColor: `rgba(45, 212, 191, ${0.08 + intensity * 0.85})` }} />;
      })}
    </div>
  );
}

function RankPath({ ranks }: { ranks: DashboardState["ranks"] }) {
  return (
    <div className="space-y-3">
      {ranks.map((rank) => (
        <div key={rank.title} className="flex items-center gap-3">
          <div className={`grid h-9 w-9 place-items-center rounded-full border ${rank.unlocked ? "border-gold/60 bg-gold/15 text-gold" : "border-white/10 bg-white/5 text-slate-500"}`}>
            {rank.unlocked ? <Trophy size={16} /> : <Lock size={16} />}
          </div>
          <div>
            <h3 className="font-bold text-white">{rank.title}</h3>
            <p className="text-xs text-slate-400">{rank.threshold} XP</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AntiBoredom() {
  const [challenge, setChallenge] = useState("");
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        const result = await api.antiBoredom();
        setChallenge(result.prompt);
      }}
      title={challenge || "Roll a study challenge"}
    >
      <Sparkles size={16} /> {challenge ? challenge : "Anti-boredom"}
    </Button>
  );
}

function DashboardActions({ refresh }: { refresh: () => Promise<void> }) {
  const [syncing, setSyncing] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="ghost"
        disabled={syncing}
        onClick={async () => {
          setSyncing(true);
          try {
            await api.syncAll();
            await refresh();
          } finally {
            setSyncing(false);
          }
        }}
      >
        <RefreshCcw size={16} /> {syncing ? "Syncing" : "Sync integrations"}
      </Button>
      <AntiBoredom />
    </div>
  );
}

function IntegrationStatusCard({ status }: { status: { configured: boolean; connected: boolean; manual_fallback: boolean } }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatusPill label="Configured" active={status.configured} />
        <StatusPill label="Connected" active={status.connected} />
        <StatusPill label="Fallback ready" active={status.manual_fallback} />
      </div>
      <p className="mt-3 text-sm text-slate-600">{status.connected ? "Connected and ready to sync." : status.configured ? "Credentials are configured. Use Connect to finish OAuth." : "Not connected yet. Manual quests, local calendar blocks, XP, streaks, boss fights, timer, and stats still work."}</p>
    </div>
  );
}

function RewardBurst({ seed }: { seed: number }) {
  if (!seed) return null;
  return (
    <div key={seed} className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 28 }).map((_, index) => (
        <span
          key={index}
          className="reward-piece absolute top-[-1rem] h-2.5 w-2.5 rounded-sm"
          style={{
            left: `${Math.random() * 100}%`,
            background: index % 3 === 0 ? "#f4c95d" : index % 3 === 1 ? "#2dd4bf" : "#8b5cf6",
            animationDelay: `${Math.random() * 0.25}s`
          }}
        />
      ))}
    </div>
  );
}

function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<AssistantState | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setState(await api.assistantState());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("workflow-context-updated", handler);
    return () => window.removeEventListener("workflow-context-updated", handler);
  }, []);

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const response = await api.sendAssistantMessage({ message: trimmed });
      setState((previous) => {
        const userMessage: AssistantMessage = {
          id: Date.now(),
          role: "user",
          content: trimmed,
          created_at: new Date().toISOString()
        };
        const addedMemories = response.memories_added.map((memory, index) => ({
          id: Date.now() + index + 1,
          category: memory.category,
          key: memory.key,
          value: memory.value,
          weight: memory.weight,
          created_at: new Date().toISOString()
        }));
        const nextMessages = previous ? [...previous.messages, userMessage, response.message] : [userMessage, response.message];
        return {
          messages: nextMessages,
          memories: previous ? [...previous.memories, ...addedMemories] : addedMemories,
          summary: response.summary
        };
      });
      setDraft("");
      window.dispatchEvent(new Event("workflow-context-updated"));
    } finally {
      setSending(false);
    }
  };

  const quickSend = (value: string) => void send(value);

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="mb-3 w-[min(92vw,22rem)] overflow-hidden rounded-lg border border-white/10 bg-midnight/96 shadow-glow backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-jade">Context Assistant</p>
                <h3 className="text-sm font-black text-white">Tell me what matters</h3>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="rounded-lg border border-white/10 bg-ink/55 p-3 text-xs text-slate-400">
                <p className="font-bold text-white">{loading ? "Loading memory..." : `${state?.summary.total_memories ?? 0} context notes saved`}</p>
                <p className="mt-1">I use this to adapt task analysis, study timing, and the workflow plan.</p>
                {state?.summary.subject_focus?.length ? <p className="mt-2 text-jade">Focus subjects: {state.summary.subject_focus.slice(0, 3).join(", ")}</p> : null}
                {state?.summary.study_windows?.length ? <p className="mt-1 text-gold">Preferred windows: {state.summary.study_windows.slice(0, 3).join(", ")}</p> : null}
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {state?.messages.length ? state.messages.map((message) => (
                  <div
                    key={`${message.role}-${message.id}`}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === "assistant" ? "bg-jade/10 text-slate-100" : "ml-auto bg-white/10 text-white"
                    }`}
                  >
                    {message.content}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-white/10 bg-white/5 p-3 text-sm text-slate-400">Share study preferences, deadlines, or constraints and I’ll remember them.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => quickSend("I study best at night and want my tasks grouped by due date.")} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10">Night focus</button>
                <button onClick={() => quickSend("My strongest subject is math and I want harder tasks prioritised there.")} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10">Math priority</button>
                <button onClick={() => quickSend("Use 50 minute focus blocks for deep work.")} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10">50 min blocks</button>
              </div>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  placeholder="Tell the assistant something..."
                  className="min-h-11 flex-1 rounded-md border border-white/10 bg-ink/80 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-jade focus:shadow-glow"
                />
                <Button onClick={() => void send(draft)} disabled={sending} className="shrink-0">
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-full border border-white/10 bg-midnight/95 px-4 py-3 text-left shadow-glow backdrop-blur-xl transition hover:border-jade/30 hover:bg-panel"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-jade text-ink">
          <MessageCircle size={18} />
        </span>
        <span>
          <span className="block text-sm font-black text-white">Context AI</span>
          <span className="text-xs text-slate-400">{state?.summary.total_memories ? `${state.summary.total_memories} saved notes` : "Keep me updated"}</span>
        </span>
      </motion.button>
    </div>
  );
}

function AssistantBubbleV2() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState("");
  const [state, setState] = useState<AssistantState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setState(await api.assistantState());
      setAssistantError("");
    } catch {
      setState(null);
      setAssistantError("Context AI is offline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("workflow-context-updated", handler);
    return () => window.removeEventListener("workflow-context-updated", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const scrollToLatest = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    scrollToLatest();
    const frame = window.requestAnimationFrame(scrollToLatest);
    const timeout = window.setTimeout(scrollToLatest, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [open, state?.messages.length, loading, sending]);

  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${Math.max(44, nextHeight)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? "auto" : "hidden";
  }, [draft, open]);

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const response = await api.sendAssistantMessage({ message: trimmed });
      setAssistantError("");
      setFollowUp(response.needs_follow_up ? response.follow_up_question : null);
      setState((previous) => previous ? { ...previous, messages: [...previous.messages, response.message], summary: response.summary } : { messages: [response.message], memories: [], summary: response.summary });
      setDraft("");
      void load();
      window.dispatchEvent(new Event("workflow-context-updated"));
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Message failed.");
    } finally {
      setSending(false);
    }
  };

  const quickSend = (value: string) => void send(value);
  const memoryCount = state?.summary.total_memories ?? 0;
  const workflowHints = state?.summary.workflow_hints ?? [];
  const subjects = state?.summary.subject_focus ?? [];
  const windows = state?.summary.study_windows ?? [];
  const topics = state?.summary.topics ?? [];
  const constraints = state?.summary.constraints ?? [];
  const engine = state?.summary.engine;
  const contextChips = [
    ...subjects.slice(0, 3).map((value) => ({ tone: "bg-violet-100 text-violet-700", value })),
    ...windows.slice(0, 3).map((value) => ({ tone: "bg-slate-200 text-slate-700", value })),
    ...workflowHints.slice(0, 3).map((value) => ({ tone: "bg-amber-100 text-amber-800", value: value.replace(/_/g, " ") })),
    ...topics.slice(0, 2).map((value) => ({ tone: "bg-purple-100 text-purple-700", value })),
    ...constraints.slice(0, 2).map((value) => ({ tone: "bg-rose-100 text-rose-700", value: value.length > 18 ? `${value.slice(0, 18)}...` : value })),
  ];

  return (
    <div className="fixed bottom-3 right-3 z-[60] sm:bottom-4 sm:right-4">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="assistant-panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 250, damping: 24 }}
            className="w-[min(92vw,21rem)] overflow-hidden rounded-xl border border-slate-200 bg-white/96 shadow-[0_24px_70px_rgba(71,61,104,0.14)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_0_4px_rgba(139,124,246,0.12)]" />
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Context AI</p>
                </div>
                <h3 className="mt-1 text-sm font-black text-slate-900">Tell me what matters</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {loading ? "Learning your workspace..." : `${memoryCount} saved notes. I use them to sort tasks and timing.`}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{engine?.model_enabled ? `Model: ${engine.model}` : "Model: local parser"}</p>
              </div>
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-violet-200 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex flex-wrap gap-2">
                  {subjects.slice(0, 3).map((item, index) => <span key={`subject-${item}-${index}`} className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">{item}</span>)}
                  {windows.slice(0, 3).map((item, index) => <span key={`window-${item}-${index}`} className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">{item}</span>)}
                  {workflowHints.slice(0, 3).map((item, index) => <span key={`hint-${item}-${index}`} className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">{item.replace(/_/g, " ")}</span>)}
                  {topics.slice(0, 2).map((item, index) => <span key={`topic-${item}-${index}`} className="rounded-full bg-purple-100 px-2 py-1 text-purple-700">{item}</span>)}
                  {constraints.slice(0, 2).map((item, index) => <span key={`constraint-${item}-${index}`} className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">{item.length > 18 ? `${item.slice(0, 18)}…` : item}</span>)}
                </div>
                {contextChips.length === 0 && <p className="mt-2 rounded border border-dashed border-slate-200 bg-white px-2 py-1 text-slate-500">No context yet.</p>}
                <p className="mt-2">I adapt the workflow engine from your notes, calendar, and TickTick.</p>
              </div>

              <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {state?.messages.length ? state.messages.map((message) => (
                  <div
                    key={`${message.role}-${message.id}`}
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-5 ${
                      message.role === "assistant"
                        ? "border border-slate-200 bg-white text-slate-700"
                        : "ml-auto border border-violet-200 bg-violet-600 text-white"
                    }`}
                  >
                    {message.content}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    Tell me about subjects, timing, deadlines, task order, or tone.
                  </p>
                )}
                {sending && (
                  <div className="max-w-[72%] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                      Thinking
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => quickSend("I study best at night and want my tasks grouped by due date.")} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-violet-200 hover:text-slate-900">Night focus</button>
                <button onClick={() => quickSend("My strongest subject is math and I want harder tasks prioritised there.")} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-violet-200 hover:text-slate-900">Math priority</button>
                <button onClick={() => quickSend("Use 50 minute focus blocks for deep work.")} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-violet-200 hover:text-slate-900">50 min blocks</button>
                <button onClick={() => quickSend("Keep the workflow minimal and sort tasks by due date across the next 7 days.")} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-violet-200 hover:text-slate-900">Next 7 days</button>
              </div>

              {followUp ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{followUp}</div> : null}
              {assistantError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{assistantError}</div> : null}

              <div className="flex gap-2">
                <textarea
                  ref={draftRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  placeholder="Tell me what to remember..."
                  rows={1}
                  className="min-h-11 max-h-36 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[0.92rem] leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:shadow-[0_0_0_4px_rgba(139,124,246,0.08)]"
                />
                <Button aria-label="Send context message" onClick={() => void send(draft)} disabled={sending || !draft.trim()} className="shrink-0 rounded-lg">
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="assistant-bubble"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setOpen(true)}
            className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-left shadow-[0_18px_50px_rgba(71,61,104,0.12)] backdrop-blur-xl transition hover:border-violet-300 hover:shadow-[0_24px_60px_rgba(109,87,230,0.16)] sm:gap-3 sm:px-4 sm:py-3"
          >
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white sm:h-10 sm:w-10">
              <MessageCircle size={17} />
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
            </span>
            <span className="min-w-0 hidden sm:block">
              <span className="block text-sm font-black text-slate-900">Context AI</span>
              <span className="block text-xs text-slate-500">{loading ? "Learning..." : memoryCount ? `${memoryCount} saved notes` : "Keep me updated"}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgressRing({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="text-center">
      <div className="mx-auto grid h-[5.25rem] w-[5.25rem] place-items-center rounded-full" style={{ background: `conic-gradient(#2dd4bf ${pct * 3.6}deg, rgba(139,124,246,.16) 0deg)` }}>
        <div className="grid h-[4.25rem] w-[4.25rem] place-items-center rounded-full bg-white">
          <span className="text-base font-black text-slate-900">{pct}%</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-slate-300">{label}</p>
      <p className="text-xs text-slate-500">{value}/{max} XP</p>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-lg border border-white/10 bg-ink/60 p-4 xl:p-5">
      <div className="mb-3 text-xl">{icon}</div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </motion.div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-jade/10 text-jade">{icon}</div>
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <span className={`rounded px-3 py-2 text-center text-sm ${active ? "bg-violet-100 text-violet-700" : "bg-white text-slate-500 border border-slate-200"}`}>{label}</span>;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-700">{value}</p>
    </div>
  );
}

function storageLabel(urlScheme?: string) {
  if (!urlScheme) return "Checking backend database";
  if (urlScheme.startsWith("postgresql")) return "Cloud database - PostgreSQL on Railway";
  if (urlScheme.startsWith("sqlite")) return "Local development database - SQLite file";
  return `Backend database - ${urlScheme}`;
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded border px-2 py-1 text-xs font-bold ${difficultyTone[tone] ?? difficultyTone.easy}`}>{children}</span>;
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-black text-white">{title}</h2>
      {action}
    </div>
  );
}

function selectNextQuest(quests: Quest[]) {
  const active = quests.filter((quest) => !quest.completed);
  if (active.length === 0) return null;
  const difficultyRank: Record<string, number> = { boss: 4, hard: 3, medium: 2, easy: 1 };
  return [...active].sort((a, b) => {
    const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return (difficultyRank[b.difficulty] ?? 1) - (difficultyRank[a.difficulty] ?? 1);
  })[0];
}

function questDueLabel(quest: Quest) {
  if (!quest.due_date) return "no due date";
  if (quest.due_date === today) return "due today";
  const due = new Date(`${quest.due_date}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

function questBorder(difficulty: string) {
  return { easy: "border-jade/20", medium: "border-gold/24", hard: "border-ember/25", boss: "border-rune/35 shadow-glow" }[difficulty] ?? "border-white/10";
}

function questAccent(difficulty: string) {
  return { easy: "bg-jade", medium: "bg-gold", hard: "bg-ember", boss: "bg-rune" }[difficulty] ?? "bg-slate-500";
}

function difficultyXp(difficulty: string) {
  return { easy: 10, medium: 30, hard: 50, boss: 200 }[difficulty] ?? 10;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}
