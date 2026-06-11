import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
        "before:animate-[shimmer_1.6s_ease-in-out_infinite] dark:before:via-white/5",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
