import { Building2, ShieldCheck, Sparkles } from "lucide-react";

/**
 * The signed-out shell: a full-bleed hero on the left, the form on the
 * right. Shared by login, signup and forgot-password so the three read
 * as one product rather than three centred cards.
 *
 * The hero collapses on small screens — below lg the backdrop becomes
 * the page background and the form floats on it, which keeps the
 * atmosphere without stealing the half of a phone screen that the
 * keyboard is about to take.
 *
 * The backdrop is CSS, not an image (see .auth-hero in globals.css), so
 * there is nothing to download before the page looks finished.
 */
const POINTS = [
  { icon: Building2, text: "Every project, quotation and invoice in one place" },
  { icon: ShieldCheck, text: "PPN, PPH and retensi computed the way your books expect" },
  { icon: Sparkles, text: "Documents that print exactly as they appear on screen" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/* Hero. Absolutely positioned behind everything below lg, its own
          column at lg and up. */}
      <div className="auth-hero absolute inset-0 overflow-hidden lg:relative lg:inset-auto lg:min-h-screen">
        <div
          aria-hidden
          className="auth-sheen pointer-events-none absolute -inset-x-40 inset-y-0"
        />
        {/* The one warm highlight, breathing slowly. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[12%] top-[10%] h-64 w-64 rounded-full bg-amber-400/25 blur-[90px] [animation:auth-bloom_11s_ease-in-out_infinite] motion-reduce:animate-none"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[8%] top-[26%] h-72 w-72 rounded-full bg-blue-500/20 blur-[100px] [animation:auth-bloom_14s_ease-in-out_infinite_reverse] motion-reduce:animate-none"
        />

        {/* Copy sits on the hero only where there is room for it. */}
        <div className="stagger-rise relative hidden h-full flex-col justify-between p-12 lg:flex xl:p-16">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 text-[15px] font-bold text-slate-900 shadow-lg shadow-black/30">
              A
            </span>
            <span className="text-sm font-semibold tracking-wide text-white/90">
              PT Andalan Warna Prima
            </span>
          </div>

          <div className="max-w-lg">
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-white xl:text-[46px]">
              Run the whole job
              <br />
              from one desk.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/65">
              Painting, epoxy and coating work — quoted, ordered, delivered
              and invoiced, without a spreadsheet in sight.
            </p>

            <ul className="mt-10 space-y-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm leading-relaxed text-white/70">
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/35">
            © {new Date().getFullYear()} PT Andalan Warna Prima
          </p>
        </div>
      </div>

      {/* Form column. Transparent over the hero on small screens, a solid
          surface once the split layout kicks in. */}
      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8 lg:bg-background">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
