import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel-hover rounded-lg border border-white/10 bg-panel/72 p-4 shadow-glow backdrop-blur ${className}`}>{children}</section>;
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-jade text-ink hover:bg-teal-300 shadow-glow",
    ghost: "bg-white/8 text-slate-100 hover:bg-white/14",
    danger: "bg-ember text-white hover:bg-orange-500 shadow-emberglow"
  };
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="min-h-10 w-full rounded-md border border-white/10 bg-ink/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-jade focus:shadow-glow"
      {...props}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-20 w-full rounded-md border border-white/10 bg-ink/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-jade focus:shadow-glow"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-10 w-full rounded-md border border-white/10 bg-ink/80 px-3 py-2 text-sm text-white outline-none transition focus:border-jade focus:shadow-glow"
      {...props}
    />
  );
}

export function Progress({ value, max = 100, tone = "jade" }: { value: number; max?: number; tone?: "jade" | "gold" | "ember" | "rune" }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { jade: "bg-jade", gold: "bg-gold", ember: "bg-ember", rune: "bg-rune" }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className={`xp-shimmer h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
