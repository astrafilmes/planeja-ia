import { createFileRoute } from "@tanstack/react-router";
import { ServidoresCatalogPage } from "@/components/m2a/ServidoresCatalogPage";

export const Route = createFileRoute("/gestores")({ component: Page });

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
