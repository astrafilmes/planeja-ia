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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6C5CE7] via-[#5b4bd1] to-[#3d2fa5] p-7 text-white shadow-[0_20px_60px_-20px_rgb(108_92_231_/_0.55)]">
      {/* decorative stars */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 size-44 text-white/15"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M50 10 L55 45 L90 50 L55 55 L50 90 L45 55 L10 50 L45 45 Z" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-24 bottom-4 size-20 text-white/20"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M50 15 L54 46 L85 50 L54 54 L50 85 L46 54 L15 50 L46 46 Z" />
      </svg>

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          {eyebrow && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/90 backdrop-blur">
              {eyebrow}
            </div>
          )}
          <h2 className="text-[28px] font-semibold leading-[1.1] tracking-tight md:text-[34px]">
            {title}
          </h2>
          {description && (
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-white/75">
              {description}
            </p>
          )}
          {cta && (
            <button
              type="button"
              onClick={onCtaClick}
              aria-label={cta}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#0a0d18] px-5 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/10 transition-all hover:-translate-y-px hover:bg-[#11162a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#5b4bd1]"
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
