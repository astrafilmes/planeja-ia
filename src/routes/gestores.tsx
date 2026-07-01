import { createFileRoute } from "@tanstack/react-router";
import { ServidoresCatalogPage } from "@/components/m2a/ServidoresCatalogPage";
import { routeHead } from "@/lib/utils/route-head";

export const Route = createFileRoute("/gestores")({
  component: Page,
  head: () =>
    routeHead({
      path: "/gestores",
      title: "Gestores",
      description:
        "Catálogo de gestores responsáveis pelos contratos administrativos no Planeja IA.",
    }),
});

function Page() {
  return (
    <ServidoresCatalogPage
      cargo="GESTOR"
      title="Gestores"
      subtitle="Catálogo dinâmico de gestores e vínculos com unidades gestoras"
      singularLabel="Gestor"
    />
  );
}
