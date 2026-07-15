// The core renderer: a pure function with no React/DOM dependency, so it
// runs identically in the browser (iframe preview) and in Node (PDF
// generation via Playwright). Block renderers are plain functions
// returning HTML strings — the `columns` layout block is handled here
// (not in block-renderers.ts) because it needs to recurse back into
// renderBlockList for each of its child columns.
import type { PageSettings, TemplateBlock, ThemeConfig } from "@/features/templates/types";
import type { DocumentRenderData } from "@/features/templates/renderer/types";
import { BLOCK_RENDERERS, isBlockVisible } from "@/features/templates/renderer/block-renderers";
import { themeToCssVariables } from "@/features/templates/renderer/theme-css";

type RenderOptions = {
  editMode?: boolean;
};

function renderColumnsBlock(block: TemplateBlock, data: DocumentRenderData, options?: RenderOptions): string {
  const ratios = (block.config.ratios as number[] | undefined) ?? [1, 1];
  const gapMm = (block.config.gap_mm as number | undefined) ?? 8;
  const verticalAlign = (block.config.vertical_align as string | undefined) ?? "top";
  const children = block.children ?? [];

  const alignMap: Record<string, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
  const totalRatio = ratios.reduce((sum, r) => sum + r, 0) || 1;

  const columnsHtml = ratios
    .map((ratio, index) => {
      const columnBlocks = children[index] ?? [];
      const widthPercent = (ratio / totalRatio) * 100;
      const inner = renderBlockList(columnBlocks, data, options);
      return `<div style="flex: 0 0 ${widthPercent}%; max-width:${widthPercent}%;">${inner}</div>`;
    })
    .join("");

  return `<div style="display:flex; gap:${gapMm}mm; align-items:${alignMap[verticalAlign] ?? "flex-start"};">${columnsHtml}</div>`;
}

function renderBlock(block: TemplateBlock, data: DocumentRenderData, options?: RenderOptions): string {
  const inner = block.type === "columns" ? renderColumnsBlock(block, data, options) : (BLOCK_RENDERERS[block.type]?.(block, data) ?? "");
  if (!inner) return "";

  const marginTop = block.style?.margin_top_mm;
  const marginBottom = block.style?.margin_bottom_mm;
  const styleParts = [
    marginTop !== undefined ? `margin-top:${marginTop}mm;` : "",
    marginBottom !== undefined ? `margin-bottom:${marginBottom}mm;` : "margin-bottom:var(--t-block-gap);",
  ].join(" ");

  const attrs = options?.editMode ? ` data-block-id="${block.id}" data-block-type="${block.type}"` : "";
  return `<div class="tpl-block" style="${styleParts}"${attrs}>${inner}</div>`;
}

function renderBlockList(blocks: TemplateBlock[], data: DocumentRenderData, options?: RenderOptions): string {
  return blocks
    .filter((b) => isBlockVisible(b, data))
    .map((b) => renderBlock(b, data, options))
    .join("");
}

function pageDimensions(pageSettings: PageSettings): { widthMm: number; heightMm: number } {
  const isLandscape = pageSettings.orientation === "landscape";
  const base = pageSettings.size === "Letter" ? { widthMm: 215.9, heightMm: 279.4 } : { widthMm: 210, heightMm: 297 };
  return isLandscape ? { widthMm: base.heightMm, heightMm: base.widthMm } : base;
}

export function renderDocument(
  blocks: TemplateBlock[],
  theme: ThemeConfig,
  data: DocumentRenderData,
  pageSettings: PageSettings = { size: "A4", orientation: "portrait" },
  options?: RenderOptions
): string {
  const cssVars = themeToCssVariables(theme);
  const { widthMm, heightMm } = pageDimensions(pageSettings);
  const body = renderBlockList(blocks, data, options);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { ${cssVars} }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${widthMm}mm;
    min-height: ${heightMm}mm;
    padding: var(--t-margin-top) var(--t-margin-right) var(--t-margin-bottom) var(--t-margin-left);
    background: var(--t-bg);
    color: var(--t-text);
    font-family: var(--t-body-font);
    font-weight: var(--t-body-weight);
    font-size: var(--t-base-size);
    line-height: var(--t-line-height);
    position: relative;
  }
  h1, h2, h3, .tpl-block b, .tpl-block strong { font-family: var(--t-heading-font); font-weight: var(--t-heading-weight); }
  table { border-radius: var(--t-radius); }
  .tpl-block[data-block-id] { outline: 1px dashed transparent; cursor: pointer; }
  .tpl-block[data-block-id]:hover { outline-color: var(--t-primary); }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
