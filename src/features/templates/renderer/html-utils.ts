// Small shared helpers for block renderers — kept dependency-free (no
// React/DOM) so the renderer runs identically in the browser (preview)
// and in Node (PDF generation via Playwright).

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
