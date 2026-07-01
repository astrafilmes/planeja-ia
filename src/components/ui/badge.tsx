import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15",
        secondary:
          "border-border/60 bg-muted text-muted-foreground hover:bg-muted/80",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline: "border-border bg-transparent text-muted-foreground",
        // Pastel tonal presets (tokenized)
        indigo:
          "border-transparent bg-chip-teal text-chip-teal-foreground",
        pink: "border-transparent bg-chip-pink text-chip-pink-foreground",
        blue: "border-transparent bg-chip-blue text-chip-blue-foreground",
        green:
          "border-transparent bg-chip-green text-chip-green-foreground",
        amber:
          "border-transparent bg-chip-amber text-chip-amber-foreground",
        slate:
          "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
