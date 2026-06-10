import { createFileRoute } from "@tanstack/react-router";
import { ServidoresCatalogPage } from "@/components/m2a/ServidoresCatalogPage";

export const Route = createFileRoute("/fiscais")({ component: Page });

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
