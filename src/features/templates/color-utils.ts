// Guided color customization (architecture Decision 7 / Section 5.3):
// a user picks one brand color and the system derives a harmonious
// palette for the rest of the theme's color tokens. Pure math, no
// dependencies — safe to call from both client (live preview) and
// server (seeding/actions) code.
type HSL = { h: number; s: number; l: number };

function hexToHsl(hex: string): HSL {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return { h, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: HSL): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const clampL = (l: number) => Math.max(0, Math.min(100, l));

export type DerivedPalette = {
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  background: string;
  surface: string;
  border: string;
};

// Derives the rest of ThemeConfig.colors from a single brand color.
// Every derived tone keeps the brand hue (a slight hue bias, per the
// "choose neutrals, don't default to them" principle) rather than
// falling back to a flat, hue-less gray.
export function derivePaletteFromPrimary(primaryHex: string): DerivedPalette {
  const { h, s } = hexToHsl(primaryHex);

  return {
    primary: primaryHex.toUpperCase(),
    secondary: hslToHex({ h: (h + 25) % 360, s: Math.min(s, 70), l: 25 }),
    text: hslToHex({ h, s: Math.min(s * 0.15, 12), l: 15 }),
    muted: hslToHex({ h, s: Math.min(s * 0.2, 15), l: 45 }),
    background: "#FFFFFF",
    surface: hslToHex({ h, s: Math.min(s * 0.3, 20), l: 98 }),
    border: hslToHex({ h, s: Math.min(s * 0.25, 18), l: clampL(90) }),
  };
}
