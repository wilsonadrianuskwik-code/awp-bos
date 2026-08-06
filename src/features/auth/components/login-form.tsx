"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signIn } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

type LoginFormProps = {
  next?: string;
};

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
    // button busy through the navigation instead of flicking back to
    // "Sign in" for the frame before the page changes.
  }

  return (
    <div className="stagger-rise">
      {/* The mark repeats here because below lg the hero column — and the
          logo on it — is not rendered, and a sign-in box with nothing to
          identify it is a phishing page. */}
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 text-[15px] font-bold text-slate-900 shadow-lg shadow-black/30">
          A
        </span>
        <span className="text-sm font-semibold tracking-wide text-white/90">
          PT Andalan Warna Prima
        </span>
      </div>

      <div
        className={cn(
          // Glass over the hero on small screens; a plain surface in the
          // form column, where there is nothing behind it to show through.
          "rounded-2xl border border-white/10 bg-white/[0.07] p-7 shadow-2xl shadow-black/40 backdrop-blur-xl",
          "lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
        )}
      >
        <div className="mb-7">
          <h2 className="text-2xl font-semibold tracking-tight text-white lg:text-foreground">
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-white/55 lg:text-muted-foreground">
            Sign in to continue to your workspace.
          </p>
        </div>

        <form action={handleSubmit} className="space-y-5">
          {next && <input type="hidden" name="next" value={next} />}

          {error && (
            <div
              role="alert"
              className="animate-page-enter rounded-lg border border-destructive/30 bg-destructive/15 px-3.5 py-2.5 text-sm text-destructive-foreground lg:text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-white/75 lg:text-foreground"
            >
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              required
              autoComplete="email"
              autoFocus
              className="h-11 border-white/15 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-white/30 lg:border-input lg:bg-background lg:text-foreground lg:placeholder:text-muted-foreground lg:focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="text-white/75 lg:text-foreground"
              >
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-xs text-white/50 transition-colors hover:text-white lg:text-muted-foreground lg:hover:text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="h-11 pr-11 border-white/15 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-white/30 lg:border-input lg:bg-background lg:text-foreground lg:focus-visible:ring-ring"
              />
              {/* tabIndex -1: reaching the submit button from the password
                  field should not require tabbing past a reveal toggle.
                  It stays clickable, and screen readers announce it. */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-white/45 transition-colors hover:text-white lg:text-muted-foreground lg:hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full text-[15px] transition-transform duration-150 active:scale-[0.985]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-white/50 lg:text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={signupHref}
            className="font-medium text-white underline-offset-4 hover:underline lg:text-primary"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
