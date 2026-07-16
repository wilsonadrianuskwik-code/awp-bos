// Remounts on every route change within the workspace (Next.js template
// semantics), which is exactly what lets the entrance animation replay
// per navigation — the one-file, zero-JS way to get smooth page
// transitions. Purely presentational: no data, no state, no layout.
export default function WorkspaceTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-page-enter">{children}</div>;
}
