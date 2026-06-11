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
          "border-transparent bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA] dark:bg-[#3a1414] dark:text-[#fca5a5]",
        outline: "border-border bg-transparent text-muted-foreground",
        // Pastel tonal presets
        indigo:
          "border-transparent bg-[#DDF4F4] text-[#007879] dark:bg-[#0e3a3b] dark:text-[#5ee2e3]",
        pink: "border-transparent bg-[#FCE7F0] text-[#B83260] dark:bg-[#4a1f36] dark:text-[#f7a8c8]",
        blue: "border-transparent bg-[#E3F0FF] text-[#1d4ed8] dark:bg-[#172a48] dark:text-[#8fb8ff]",
        green:
          "border-transparent bg-[#DCF6E6] text-[#0F8a3d] dark:bg-[#0f3b2a] dark:text-[#7be0a4]",
        amber:
          "border-transparent bg-[#FFF1D6] text-[#B45309] dark:bg-[#3d2f10] dark:text-[#f7c277]",
        slate:
          "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
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
