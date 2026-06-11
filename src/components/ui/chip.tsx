import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium leading-none transition-all",
  {
    variants: {
      tone: {
        neutral:
          "bg-muted text-foreground/75 hover:bg-muted/80",
        indigo:
          "bg-[#EEEAFE] text-[#5848d6] hover:bg-[#e3ddfc] dark:bg-[#2a2256] dark:text-[#b9adff]",
        pink: "bg-[#FCE7F0] text-[#B83260] hover:bg-[#f9d8e5] dark:bg-[#4a1f36] dark:text-[#f7a8c8]",
        blue: "bg-[#E3F0FF] text-[#1d4ed8] hover:bg-[#d3e6ff] dark:bg-[#172a48] dark:text-[#8fb8ff]",
        green:
          "bg-[#DCF6E6] text-[#0F8a3d] hover:bg-[#cdf0db] dark:bg-[#0f3b2a] dark:text-[#7be0a4]",
        amber:
          "bg-[#FFF1D6] text-[#B45309] hover:bg-[#ffe6b8] dark:bg-[#3d2f10] dark:text-[#f7c277]",
        outline:
          "border border-border/70 bg-transparent text-muted-foreground hover:bg-muted/40",
      },
      size: {
        sm: "h-6 px-2.5 text-[11px]",
        md: "h-7 px-3 text-[12px]",
        lg: "h-8 px-3.5 text-[13px]",
      },
      interactive: {
        true: "cursor-pointer hover:-translate-y-px",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
      interactive: false,
    },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  icon?: React.ReactNode;
  asChild?: boolean;
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone, size, interactive, icon, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(chipVariants({ tone, size, interactive }), className)}
      {...props}
    >
      {icon && <span className="-ml-0.5 inline-flex">{icon}</span>}
      {children}
    </span>
  ),
);
Chip.displayName = "Chip";

export { chipVariants };
