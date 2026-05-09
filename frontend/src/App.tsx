import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  BarChart3,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Flame,
  Gauge,
  Gem,
  Hourglass,
  Import,
  Link,
  ListChecks,
  Lock,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Shield,
  Snowflake,
  Sparkles,
  Swords,
  TimerReset,
  Target,
  Trophy,
  Wand2,
  Zap
} from "lucide-react";
import { api, apiBaseUrl } from "./lib/api";
import type { BossFight, CalendarEvent, DashboardState, DeploymentConfig, IntegrationCalendarEvent, IntegrationIntelligence, IntegrationTask, Quest, StudySession } from "./types";
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

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [levelFlash, setLevelFlash] = useState(false);
  const [rewardBurst, setRewardBurst] = useState(0);

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

  const wording = state?.profile.shrivaishnava_mode
    ? { quests: "Sadhana", focus: "Mind refinement", streak: "Discipline flame", mission: "Today's refinement" }
    : { quests: "Quests", focus: "Focus", streak: "Daily streak", mission: "Today's mission" };
  const nextQuest = useMemo(() => selectNextQuest(state?.quests ?? []), [state]);

  const completeWithReward = async (action: () => Promise<void>, major = false) => {
    await action();
    if (major) setRewardBurst(Date.now());
    await refresh();
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-200">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Shield className="mx-auto mb-3 text-jade" size={42} />
          <p className="font-black">Loading study realm...</p>
        </motion.div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-slate-200">
        <Panel className="max-w-xl">
          <h1 className="text-xl font-bold">Backend unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error || "Start FastAPI on port 8000."}</p>
          <Button className="mt-4" onClick={refresh}>
            <RefreshCcw size={16} /> Retry
          </Button>
        </Panel>
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden text-slate-100">
      <AmbientBackdrop />
      <RewardBurst seed={rewardBurst} />
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

      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-midnight/90 p-4 backdrop-blur-xl lg:block">
        <div className="mb-6 rounded-lg border border-jade/20 bg-jade/8 p-4">
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

      <main className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-midnight/86 px-4 py-3 backdrop-blur lg:hidden">
          <Select value={page} onChange={(event) => setPage(event.target.value as Page)}>
            {nav.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
          </Select>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-5 md:py-7">
          {error && <div className="mb-4 rounded-md border border-ember/40 bg-ember/10 p-3 text-sm text-orange-100">{error}</div>}
          <RankHero state={state} wording={wording} />
          <QuickLaunch state={state} nextQuest={nextQuest} setPage={setPage} refresh={refresh} wording={wording} />
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {page === "dashboard" && <Dashboard state={state} refresh={refresh} completeWithReward={completeWithReward} wording={wording} />}
              {page === "integrations" && <IntegrationDataHub refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "quests" && <Quests state={state} refresh={refresh} completeWithReward={completeWithReward} />}
              {page === "timer" && <StudyTimer refresh={refresh} triggerReward={() => setRewardBurst(Date.now())} />}
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
    <section className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-panel via-midnight to-ink p-5 shadow-glow"
      >
        <div className="absolute right-[-6rem] top-[-8rem] h-72 w-72 rounded-full bg-jade/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-72 w-72 rounded-full bg-rune/12 blur-3xl" />
        <div className="soft-float absolute right-8 top-8 hidden h-24 w-24 rounded-full border border-gold/20 bg-gold/5 lg:block">
          <div className="absolute inset-4 rounded-full border border-jade/20" />
          <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold" size={24} />
        </div>
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
              <Trophy size={14} /> Current Rank: {profile.rank_title}
            </div>
            <h2 className="text-4xl font-black text-white md:text-6xl">Level {profile.level} Study Run</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{state.quote.body}</p>
            <div className="mt-5 max-w-2xl">
              <div className="mb-2 flex justify-between text-sm text-slate-300">
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
      <Panel className="bg-gradient-to-br from-panel2/90 to-midnight">
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
    <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setPage("quests")}
        className="group min-h-20 rounded-lg border border-jade/20 bg-gradient-to-br from-jade/12 to-ink/70 p-4 text-left shadow-glow transition hover:border-jade/45"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade">Next move</p>
            <h3 className="mt-1 line-clamp-1 text-lg font-black text-white">{nextQuest?.title ?? "Create a focused quest"}</h3>
            <p className="mt-1 text-sm text-slate-400">{nextQuest ? `${nextQuest.subject} - ${nextQuest.xp_reward} XP` : `${wording.focus} starts with one clear action.`}</p>
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
      className="rounded-lg border border-white/10 bg-panel/70 px-4 py-3 text-left shadow-glow backdrop-blur transition hover:border-gold/30 hover:bg-white/8"
    >
      <span className="mb-2 grid h-9 w-9 place-items-center rounded-md bg-white/8 text-gold">{icon}</span>
      <span className="block text-lg font-black text-white">{label}</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </motion.button>
  );
}

function Dashboard({ state, refresh, completeWithReward, wording }: { state: DashboardState; refresh: () => Promise<void>; completeWithReward: (action: () => Promise<void>, major?: boolean) => Promise<void>; wording: Record<string, string> }) {
  const daily = state.quests.filter((q) => q.type === "daily");
  const connectedCount = Number(state.integrations.ticktick.connected) + Number(state.integrations.google_calendar.connected);
  const nextQuest = selectNextQuest(state.quests);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Panel className="xl:row-span-2">
        <PanelHeader title={`${wording.quests} Board`} action={<DashboardActions refresh={refresh} />} />
        <NextActionCard quest={nextQuest} completeWithReward={completeWithReward} />
        <EnhancedQuestBoard quests={daily.length ? daily : state.quests.slice(0, 6)} completeWithReward={completeWithReward} />
      </Panel>
      <Panel>
        <PanelHeader title="Integration Intel" />
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat icon={<Import className="text-jade" />} label="Connected feeds" value={`${connectedCount}/2`} />
          <MiniStat icon={<ListChecks className="text-gold" />} label="Imported quests" value={state.quests.filter((q) => q.external_source).length.toString()} />
          <MiniStat icon={<CalendarDays className="text-rune" />} label="Study events" value={state.events.filter((event) => event.is_study_block).length.toString()} />
        </div>
        <p className="mt-3 text-sm text-slate-400">Sync turns TickTick priorities into quest difficulty and Calendar study/exam events into focus quests or boss fights.</p>
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
  const [tab, setTab] = useState<"overview" | "ticktick" | "calendar" | "gameplay">("overview");
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
    return () => window.removeEventListener("ticktick-updated", handler);
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
        {(["overview", "ticktick", "calendar", "gameplay"] as const).map((item) => (
          <Button key={item} variant={tab === item ? "primary" : "ghost"} onClick={() => setTab(item)}>
            {item === "overview" ? "How it works" : item === "ticktick" ? "TickTick data" : item === "calendar" ? "Calendar data" : "Generated gameplay"}
          </Button>
        ))}
      </div>

      {tab === "overview" && <IntegrationRules rules={intel.rules} />}
      {tab === "ticktick" && <TickTickDataExplorer intel={intel} completeWithReward={completeWithReward} />}
      {tab === "calendar" && <CalendarDataExplorer intel={intel} />}
      {tab === "gameplay" && <GeneratedGameplay intel={intel} completeWithReward={completeWithReward} />}
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

function StudyTimer({ refresh, triggerReward }: { refresh: () => Promise<void>; triggerReward: () => void }) {
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
  const [deployment, setDeployment] = useState<DeploymentConfig | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const google = state.integrations.google_calendar;
  const ticktick = state.integrations.ticktick;
  useEffect(() => {
    void api.deploymentConfig().then(setDeployment).catch(() => setDeployment(null));
    void api.health().then(setHealth).catch(() => setHealth(null));
  }, []);
  const save = async () => {
    await api.updateSettings({
      display_name: name,
      shrivaishnava_mode: !state.profile.shrivaishnava_mode,
      daily_xp_goal: dailyGoal,
      weekly_xp_goal: weeklyGoal
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
          <Button onClick={save}>{state.profile.shrivaishnava_mode ? "Use RPG wording" : "Use Shrivaishnava mode"}</Button>
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
      <Panel>
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
    <div className="rounded-lg border border-white/10 bg-ink/50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatusPill label="Configured" active={status.configured} />
        <StatusPill label="Connected" active={status.connected} />
        <StatusPill label="Fallback ready" active={status.manual_fallback} />
      </div>
      <p className="mt-3 text-sm text-slate-400">{status.connected ? "Connected and ready to sync." : status.configured ? "Credentials are configured. Use Connect to finish OAuth." : "Not connected yet. Manual quests, local calendar blocks, XP, streaks, boss fights, timer, and stats still work."}</p>
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

function ProgressRing({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="text-center">
      <div className="mx-auto grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#2dd4bf ${pct * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}>
        <div className="grid h-20 w-20 place-items-center rounded-full bg-midnight">
          <span className="text-lg font-black text-white">{pct}%</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-slate-300">{label}</p>
      <p className="text-xs text-slate-500">{value}/{max} XP</p>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-lg border border-white/10 bg-ink/60 p-3">
      <div className="mb-2">{icon}</div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
    </motion.div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-5 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-jade/10 text-jade">{icon}</div>
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <span className={`rounded px-3 py-2 text-center text-sm ${active ? "bg-jade/15 text-teal-200" : "bg-white/8 text-slate-400"}`}>{label}</span>;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-ink/55 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded border px-2 py-1 text-xs font-bold ${difficultyTone[tone] ?? difficultyTone.easy}`}>{children}</span>;
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-black text-white">{title}</h2>
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
