"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { signIn } from "@/features/auth/actions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

type LoginFormProps = {
  next?: string;
};

/**
 * Pill inputs, one accent, and a lot of air.
 *
 * The fields are styled here rather than through <Input>: the app's input
 * is a 6px-radius control sized for dense forms, and pulling it toward
 * this shape would have dragged every table filter and dialog with it.
 * Two fields on one page is the cheaper side of that trade.
 */
const FIELD =
  "h-[54px] w-full rounded-full border border-white/12 bg-white/[0.07] px-5 text-[15px] text-white " +
  "placeholder:text-white/40 outline-none transition-[border-color,box-shadow,background-color] duration-200 " +
  "hover:border-white/25 hover:bg-white/[0.1] " +
  "focus:border-[hsl(var(--auth-accent))] focus:bg-white/[0.1] focus:shadow-[0_0_0_4px_hsl(var(--auth-accent)/0.22)]";

export function LoginForm({ next }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the action redirects; leaving `loading` set keeps the
    // button busy through the navigation rather than flicking back to
    // "Sign in" for the frame before the page changes.
  }

  return (
    <div
      // Scoped to this form: the amber is the sign-in page's accent, taken
      // off the hard hats in the photograph, and has no business leaking
      // into the app's cobalt.
      style={{ "--auth-accent": "32 95% 44%" } as React.CSSProperties}
    >
      {/* Masthead: name left, the other door right — the one thing
          someone who cannot sign in is actually looking for. */}
      <div className="auth-fade mb-14 flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Andalan Warna Prima
        </span>
        <Link
          href={signupHref}
          className="group flex items-center gap-1.5 text-[13px] text-white/55 transition-colors duration-200 hover:text-white"
        >
          <UserPlus className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-px" />
          Sign Up
        </Link>
      </div>

      <h1 className="auth-fade mb-9 text-[42px] font-semibold leading-none tracking-[-0.03em] text-white [animation-delay:60ms]">
        Sign In
      </h1>

      <form action={handleSubmit} className="space-y-3.5">
        {next && <input type="hidden" name="next" value={next} />}

        {error && (
          <div
            role="alert"
            className="animate-page-enter rounded-2xl border border-red-400/30 bg-red-500/15 px-5 py-3 text-[13px] text-red-200"
          >
            {error}
          </div>
        )}

        <div className="auth-fade [animation-delay:120ms]">
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Email address"
            required
            autoComplete="email"
            autoFocus
            className={FIELD}
          />
        </div>

        <div className="auth-fade [animation-delay:180ms]">
          <Label htmlFor="password" className="sr-only">
            Password
          </Label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              required
              autoComplete="current-password"
              className={cn(FIELD, "pr-14")}
            />
            {/* tabIndex -1 on purpose: getting from the password field to
                the submit button should not mean tabbing past a toggle.
                It stays clickable, and screen readers announce it. */}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        <div className="auth-fade pl-5 [animation-delay:220ms]">
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-[hsl(var(--auth-accent))] underline-offset-4 transition-opacity duration-200 hover:underline hover:opacity-80"
          >
            Forgot password?
          </Link>
        </div>

        <div className="auth-fade pt-5 [animation-delay:280ms]">
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "group relative flex h-[54px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-full",
              "text-[15px] font-semibold text-white",
              "bg-[linear-gradient(100deg,hsl(24_95%_50%),hsl(38_95%_50%))] bg-[length:180%_100%] bg-[position:0%_0%]",
              "shadow-[0_8px_20px_-6px_hsl(var(--auth-accent)/0.5)]",
              "transition-[background-position,transform,box-shadow] duration-300",
              "hover:bg-[position:100%_0%] hover:shadow-[0_12px_26px_-6px_hsl(var(--auth-accent)/0.62)]",
              "active:scale-[0.985]",
              "disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:shadow-[0_8px_20px_-6px_hsl(var(--auth-accent)/0.5)]"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign In
                <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </form>

      <p className="auth-fade mt-14 text-[12px] text-white/40 [animation-delay:340ms]">
        © {new Date().getFullYear()} PT Andalan Warna Prima
      </p>
    </div>
  );
}
