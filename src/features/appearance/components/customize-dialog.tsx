"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { ACCENTS, CANVASES } from "@/features/appearance/appearance";
import { useAppearance } from "@/features/appearance/use-appearance";

const MODES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "Auto", icon: Monitor },
] as const;

/**
 * Appearance settings: light/dark/auto, accent colour, canvas tint.
 *
 * A dialog rather than a Settings page because these are per-person
 * browser preferences, not workspace configuration — putting them in
 * Settings would imply they're shared, and they aren't.
 */
export function CustomizeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent, canvas, setCanvas } = useAppearance();

  // next-themes only knows the resolved theme on the client; rendering
  // the selected state before mount would mismatch the server HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize</DialogTitle>
          <DialogDescription>
            Personalize how the app looks. Saved to this browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section label="Appearance">
            <div className="grid grid-cols-3 gap-3">
              {MODES.map((mode) => {
                const selected = mounted && theme === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setTheme(mode.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-colors duration-100",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <mode.icon
                      className={cn(
                        "h-5 w-5",
                        selected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        selected ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {mode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Accent color">
            <div className="grid grid-cols-3 gap-2">
              {ACCENTS.map((option) => {
                const selected = mounted && accent === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAccent(option.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors duration-100",
                      selected
                        ? "border-primary/60 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                      style={{ backgroundColor: option.swatch }}
                    >
                      {selected && (
                        <Check className="h-3 w-3 text-white drop-shadow" />
                      )}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Background">
            <div className="flex flex-wrap gap-2">
              {CANVASES.map((option) => {
                const selected = mounted && canvas === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCanvas(option.id)}
                    title={option.label}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors duration-100",
                      selected
                        ? "border-primary/60 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-md border"
                      style={{ backgroundColor: option.swatch }}
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tints the app canvas. Cards, documents and printed output
              stay white.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
