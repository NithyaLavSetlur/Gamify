import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel-hover rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_1px_0_rgba(15,23,42,0.03),0_12px_36px_rgba(71,61,104,0.08)] backdrop-blur ${className}`}>{children}</section>;
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-violet-600 text-white hover:bg-violet-500 shadow-[0_10px_24px_rgba(109,87,230,0.16)]",
    ghost: "border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100",
    danger: "bg-rose-500 text-white hover:bg-rose-400 shadow-[0_10px_24px_rgba(244,63,94,0.14)]"
  };
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="min-h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:shadow-[0_0_0_4px_rgba(139,124,246,0.08)]"
      {...props}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-20 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:shadow-[0_0_0_4px_rgba(139,124,246,0.08)]"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:shadow-[0_0_0_4px_rgba(139,124,246,0.08)]"
      {...props}
    />
  );
}

export function Progress({ value, max = 100, tone = "jade" }: { value: number; max?: number; tone?: "jade" | "gold" | "ember" | "rune" }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { jade: "bg-jade", gold: "bg-gold", ember: "bg-ember", rune: "bg-rune" }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div className={`xp-shimmer h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
