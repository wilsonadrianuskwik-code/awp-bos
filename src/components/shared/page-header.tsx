type PageHeaderProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

// The page-level title row. Kept deliberately compact (20px semibold, not
// a display size): in a working tool the title is orientation, not the
// content — Linear/Stripe both cap page titles around this scale.
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
