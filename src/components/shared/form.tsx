import { cn } from "@/lib/utils/cn";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// The shared form system. Every create/edit form composes these four
// primitives so field spacing, grid behavior, required markers, and the
// action row are identical across modules.
//
//   <form onSubmit={...}>
//     <FormSection title="…">
//       <FormGrid>
//         <FieldGroup label="Name" htmlFor="name" required>
//           <Input id="name" name="name" … />
//         </FieldGroup>
//         …
//       </FormGrid>
//       <FieldGroup label="Notes" htmlFor="notes">…</FieldGroup>  // full width
//       <FormActions>…buttons…</FormActions>
//     </FormSection>
//   </form>

// A titled card grouping related fields. Omit title/description for a bare
// section.
export function FormSection({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

// Responsive field layout: two columns from the `sm` breakpoint up, one
// column on mobile.
export function FormGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>
  );
}

// A label + control pair with consistent spacing, an optional required
// marker, and an optional hint line below the control.
export function FieldGroup({
  label,
  htmlFor,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// The trailing action row, separated from the fields by a hairline. The
// primary action goes first (left).
export function FormActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3 border-t pt-6", className)}>
      {children}
    </div>
  );
}
