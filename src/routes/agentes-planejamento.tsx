import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/route-head";
import { AgentesPlanejamentoPage } from "@/components/m2a/AgentesPlanejamentoPage";

export const Route = createFileRoute("/agentes-planejamento")({
  component: AgentesPlanejamentoPage,
  head: () =>
    routeHead({
      path: "/agentes-planejamento",
      title: "Agentes de Planejamento",
      description: "Catálogo de agentes de planejamento por unidade orçamentária.",
      noindex: true,
    }),
});
