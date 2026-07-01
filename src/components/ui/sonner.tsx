import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toaster global padronizado nos tokens semânticos do design system.
 * Não usar cores hardcoded (slate/white) — respeitar `--card`, `--border`,
 * `--foreground` etc. para funcionar em light e dark.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-[var(--shadow-elevated)] group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          success: "group-[.toaster]:!text-success",
          error: "group-[.toaster]:!text-destructive",
          warning: "group-[.toaster]:!text-warning",
          info: "group-[.toaster]:!text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
