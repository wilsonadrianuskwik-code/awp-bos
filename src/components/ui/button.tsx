import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  // The press physics (1px translate on :active) plus the inset top
  // highlight on solid variants are what give buttons a tactile,
  // "manufactured" quality — the ClickUp/Linear treatment — without any
  // gradient or heavy shadow.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-200 [transition-timing-function:var(--spring-crisp)] active:scale-[0.97] active:duration-[80ms] active:[transition-timing-function:linear] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_1px_2px_0_rgba(16,24,40,0.12)] hover:bg-primary/90 active:translate-y-px active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_1px_2px_0_rgba(16,24,40,0.12)] hover:bg-destructive/90 active:translate-y-px active:shadow-none",
        outline:
          "border border-input bg-card shadow-2xs hover:bg-muted/60 hover:text-foreground active:translate-y-px active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:translate-y-px",
        ghost: "hover:bg-muted/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  // When true, renders a leading spinner and disables the button. Used
  // for submit/mutation buttons so pending state looks the same
  // everywhere. Not compatible with asChild (a Slot expects one child).
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(asChild ? {} : { disabled: disabled || loading })}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
