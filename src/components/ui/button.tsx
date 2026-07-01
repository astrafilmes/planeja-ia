import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "border border-destructive/20 bg-destructive/10 text-destructive shadow-sm hover:bg-destructive/15",
        outline:
          "border border-input bg-transparent text-foreground shadow-sm hover:border-border hover:bg-muted hover:text-foreground",
        secondary:
          "border border-border bg-card text-foreground shadow-sm hover:bg-muted hover:text-foreground",
        ghost:
          "text-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        cta:
          "bg-cta text-cta-foreground shadow-[0_8px_24px_-8px_rgb(15_23_42_/_0.45)] hover:translate-y-[-1px] hover:shadow-[0_12px_28px_-10px_rgb(15_23_42_/_0.55)]",
        soft:
          "bg-accent-soft text-accent-strong hover:bg-accent-soft/80 dark:bg-accent-soft dark:text-accent-foreground",
        accent:
          "bg-accent text-accent-foreground shadow-[0_8px_24px_-8px_rgb(0_167_168_/_0.45)] hover:bg-accent-strong hover:translate-y-[-1px]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 min-h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        pill: "h-11 rounded-full px-6 text-[13px]",
        icon: "h-9 min-h-9 w-9 min-w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
