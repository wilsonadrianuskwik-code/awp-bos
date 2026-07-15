import type { ThemeConfig } from "@/features/templates/types";

// Converts a ThemeConfig into the CSS custom properties every block
// renderer references (var(--t-primary), etc.). Swapping a theme is
// just re-running this and replacing the <style> tag — the whole
// document re-paints without any block renderer re-running its logic.
export function themeToCssVariables(theme: ThemeConfig): string {
  const { colors, typography, spacing, borders } = theme;

  return `
    --t-primary: ${colors.primary};
    --t-secondary: ${colors.secondary};
    --t-text: ${colors.text};
    --t-muted: ${colors.muted};
    --t-bg: ${colors.background};
    --t-surface: ${colors.surface};
    --t-border: ${colors.border};
    --t-heading-font: ${typography.heading_family};
    --t-body-font: ${typography.body_family};
    --t-mono-font: ${typography.mono_family};
    --t-base-size: ${typography.base_size_pt}pt;
    --t-scale: ${typography.scale};
    --t-heading-weight: ${typography.heading_weight};
    --t-body-weight: ${typography.body_weight};
    --t-line-height: ${typography.line_height};
    --t-radius: ${borders.radius_px}px;
    --t-border-width: ${borders.width_px}px;
    --t-block-gap: ${spacing.block_gap_mm}mm;
    --t-margin-top: ${spacing.page_margin_mm.top}mm;
    --t-margin-right: ${spacing.page_margin_mm.right}mm;
    --t-margin-bottom: ${spacing.page_margin_mm.bottom}mm;
    --t-margin-left: ${spacing.page_margin_mm.left}mm;
  `.trim();
}
