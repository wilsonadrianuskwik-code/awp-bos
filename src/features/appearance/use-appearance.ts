"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACCENT_KEY,
  CANVAS_KEY,
  DEFAULT_ACCENT,
  DEFAULT_CANVAS,
  isAccent,
  isCanvas,
  type AccentId,
  type CanvasId,
} from "@/features/appearance/appearance";

/**
 * Reads and writes the accent/canvas choice.
 *
 * State starts at the defaults and syncs from localStorage in an effect
 * rather than reading during render: the server can't see localStorage,
 * so reading it during render would produce a hydration mismatch. The
 * inline script in <head> has already applied the real values to the
 * DOM by then, so nothing flashes — this hook is only catching the
 * React state up to what the page is already showing.
 */
export function useAppearance() {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [canvas, setCanvasState] = useState<CanvasId>(DEFAULT_CANVAS);

  useEffect(() => {
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    const storedCanvas = localStorage.getItem(CANVAS_KEY);
    if (isAccent(storedAccent)) setAccentState(storedAccent);
    if (isCanvas(storedCanvas)) setCanvasState(storedCanvas);
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    localStorage.setItem(ACCENT_KEY, next);
    document.documentElement.setAttribute("data-accent", next);
  }, []);

  const setCanvas = useCallback((next: CanvasId) => {
    setCanvasState(next);
    localStorage.setItem(CANVAS_KEY, next);
    document.documentElement.setAttribute("data-canvas", next);
  }, []);

  return { accent, setAccent, canvas, setCanvas };
}
