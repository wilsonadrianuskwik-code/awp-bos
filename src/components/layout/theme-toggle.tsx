"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomizeDialog } from "@/features/appearance/components/customize-dialog";

/**
 * Opens the Customize dialog (appearance mode, accent, canvas).
 *
 * Replaces the old one-click light/dark toggle: with three modes plus
 * ten accents plus five canvases behind it, a cycling button can no
 * longer express the choice. Light/dark is the first control inside.
 */
export function ThemeToggle() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Customize appearance"
        title="Customize appearance"
      >
        <Palette className="h-[1.2rem] w-[1.2rem]" />
      </Button>
      <CustomizeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
