"use client";

import type { ReactNode } from "react";
import { renderDocumentFragment } from "@/features/templates/renderer/render-document";
import type { DocumentTemplateWithTheme } from "@/features/templates/types";
import type { DocumentRenderData } from "@/features/templates/renderer/types";

type DocumentRenderViewProps = {
  template: DocumentTemplateWithTheme | null;
  data: DocumentRenderData;
  /**
   * Rendered instead, unchanged, when there's no usable template/theme —
   * this is what keeps print fully working for any workspace that hasn't
   * been seeded with (or hasn't kept) a default design yet, satisfying
   * the migration requirement that nothing breaks mid-transition.
   */
  fallback: ReactNode;
};

// Renders a document through the new pure renderDocument()/renderer
// pipeline, styled via injected CSS custom properties from the
// template's theme. Used for print views today (Milestone 3); the same
// renderDocumentFragment() call will back the live Designer preview and
// the client portal later.
export function DocumentRenderView({ template, data, fallback }: DocumentRenderViewProps) {
  if (!template || !template.theme || !Array.isArray(template.blocks) || template.blocks.length === 0) {
    return <>{fallback}</>;
  }

  const { css, html } = renderDocumentFragment(template.blocks, template.theme.config, data, template.page_settings);

  return (
    <div className="hidden print:block">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="tpl-document" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
