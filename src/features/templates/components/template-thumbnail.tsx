"use client";

import { renderDocumentFragment } from "@/features/templates/renderer/render-document";
import { getSampleRenderData } from "@/features/templates/sample-data";
import type { DocumentTemplate, TemplateTheme } from "@/features/templates/types";

const MM_TO_PX = 3.78; // ~96dpi, close enough for a thumbnail preview

type TemplateThumbnailProps = {
  template: DocumentTemplate;
  theme: TemplateTheme | null;
  /** Rendered thumbnail height in px — width follows the page's aspect ratio. */
  height?: number;
};

// Renders a live, scaled-down preview of a real design through the same
// renderDocument() pipeline actual documents use — so what you see in
// the gallery is exactly what the document will look like, not a
// separately-maintained static mockup image.
export function TemplateThumbnail({ template, theme, height = 220 }: TemplateThumbnailProps) {
  if (!theme || !Array.isArray(template.blocks) || template.blocks.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        No preview available
      </div>
    );
  }

  const data = getSampleRenderData(template.document_type);
  const { css, html, widthMm, heightMm } = renderDocumentFragment(template.blocks, theme.config, data, template.page_settings);

  const widthPx = widthMm * MM_TO_PX;
  const heightPx = heightMm * MM_TO_PX;
  const scale = height / heightPx;

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted" style={{ height }}>
      <div
        style={{
          width: widthPx,
          height: heightPx,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="tpl-document" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
