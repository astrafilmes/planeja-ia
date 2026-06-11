// Helper to produce per-route SEO head metadata (title, description,
// canonical, og:*, twitter:*) for TanStack Start routes.

const SITE_URL = "https://planeja-ia.lovable.app";
const BRAND = "PLANEJA-IA";

export interface RouteHeadInput {
  title: string;
  description: string;
  /** Route path starting with "/", e.g. "/dashboard". */
  path: string;
  /** Optional override for og:type (default "website"). */
  ogType?: string;
  /** When true, instructs crawlers not to index this route. */
  noindex?: boolean;
}

export function routeHead(input: RouteHeadInput) {
  const fullTitle = `${input.title} | ${BRAND}`;
  const canonical = `${SITE_URL}${input.path === "/" ? "/" : input.path}`;
  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: input.description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: input.description },
    { property: "og:url", content: canonical },
    { property: "og:type", content: input.ogType ?? "website" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: input.description },
    { name: "twitter:card", content: "summary_large_image" },
  ];
  if (input.noindex) {
    meta.push({ name: "robots", content: "noindex,nofollow" });
  }
  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
  };
}
