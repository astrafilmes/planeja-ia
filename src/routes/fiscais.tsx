import { createFileRoute } from "@tanstack/react-router";
import { ServidoresCatalogPage } from "@/components/m2a/ServidoresCatalogPage";
import { routeHead } from "@/lib/utils/route-head";

export const Route = createFileRoute("/fiscais")({
  component: Page,
  head: () =>
    routeHead({
      path: "/fiscais",
      title: "Fiscais",
      description:
        "Catálogo de fiscais de contrato disponíveis para designação em contratações públicas.",
    }),
});

function Page() {
  return (
    <ServidoresCatalogPage
      cargo="FISCAL"
      title="Fiscais"
      subtitle="Catálogo dinâmico de fiscais e vínculos com unidades gestoras"
      singularLabel="Fiscal"
    />
  );
}
