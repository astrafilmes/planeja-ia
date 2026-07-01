import { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export function HeroCard({
  eyebrow,
  title,
  description,
  cta,
  onCtaClick,
  illustration,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  cta?: string;
  onCtaClick?: () => void;
  illustration?: ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border/40 p-7 text-primary-foreground"
      style={{ backgroundImage: "var(--hero-gradient)" }}
    >
      {/* decorative stars */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 size-44 text-primary-foreground/15"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M50 10 L55 45 L90 50 L55 55 L50 90 L45 55 L10 50 L45 45 Z" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-24 bottom-4 size-20 text-primary-foreground/20"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M50 15 L54 46 L85 50 L54 54 L50 85 L46 54 L15 50 L46 46 Z" />
      </svg>

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          {eyebrow && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-foreground/90 backdrop-blur">
              {eyebrow}
            </div>
          )}
          <h2 className="text-[28px] font-semibold leading-[1.1] tracking-tight md:text-[34px]">
            {title}
          </h2>
          {description && (
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-primary-foreground/75">
              {description}
            </p>
          )}
          {cta && (
            <button
              type="button"
              onClick={onCtaClick}
              aria-label={cta}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-cta px-5 text-[13px] font-medium text-cta-foreground ring-1 ring-border/30 transition-all hover:-translate-y-px hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {cta}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {illustration && (
          <div className="relative z-10 hidden md:block">{illustration}</div>
        )}
      </div>
    </div>
  );
}
