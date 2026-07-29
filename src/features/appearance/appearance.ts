/**
 * Accent and canvas presets.
 *
 * These are a *personal* preference, not workspace configuration: two
 * people sharing a workspace can each want a different accent, so this
 * lives in localStorage and never touches the database. That's also why
 * it isn't in Settings, which is workspace-level.
 *
 * The swatch hex values here are for the picker only. What actually
 * themes the app is the `data-accent` / `data-canvas` attribute on
 * <html> and the CSS variables it selects (globals.css) — so a preset
 * automatically works in both light and dark mode without the picker
 * knowing anything about the current mode.
 */
export const ACCENTS = [
  { id: "black", label: "Black", swatch: "#3c4257" },
  { id: "purple", label: "Purple", swatch: "#8b5cf6" },
  { id: "blue", label: "Blue", swatch: "#0ea5e9" },
  { id: "pink", label: "Pink", swatch: "#ec4899" },
  { id: "violet", label: "Violet", swatch: "#c026d3" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "orange", label: "Orange", swatch: "#ea580c" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "bronze", label: "Bronze", swatch: "#a1785a" },
  { id: "mint", label: "Mint", swatch: "#10b981" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const CANVASES = [
  { id: "slate", label: "Slate", swatch: "#f7f8fa" },
  { id: "white", label: "White", swatch: "#ffffff" },
  { id: "warm", label: "Warm", swatch: "#faf8f3" },
  { id: "cool", label: "Cool", swatch: "#f2f7fb" },
  { id: "mist", label: "Mist", swatch: "#f3f8f6" },
] as const;

export type CanvasId = (typeof CANVASES)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "indigo";
export const DEFAULT_CANVAS: CanvasId = "slate";

export const ACCENT_KEY = "bos-accent";
export const CANVAS_KEY = "bos-canvas";

export function isAccent(value: string | null): value is AccentId {
  return !!value && ACCENTS.some((a) => a.id === value);
}

export function isCanvas(value: string | null): value is CanvasId {
  return !!value && CANVASES.some((c) => c.id === value);
}

/**
 * Written into <head> as a blocking script so the attributes are set
 * before first paint. Without it the app renders one frame in the
 * default accent and visibly snaps — the same reason next-themes ships
 * its own inline script.
 */
export const APPEARANCE_INIT_SCRIPT = `
(function () {
  try {
    var root = document.documentElement;
    var accent = localStorage.getItem(${JSON.stringify(ACCENT_KEY)}) || ${JSON.stringify(DEFAULT_ACCENT)};
    var canvas = localStorage.getItem(${JSON.stringify(CANVAS_KEY)}) || ${JSON.stringify(DEFAULT_CANVAS)};
    root.setAttribute("data-accent", accent);
    root.setAttribute("data-canvas", canvas);
  } catch (e) {}
})();
`;
