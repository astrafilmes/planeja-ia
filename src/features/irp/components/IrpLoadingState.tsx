import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";

export function IrpLoadingState() {
  return (
    <AppShell
      title="Importação IRP"
      subtitle="Carregue a planilha consolidada e gere os arquivos por secretaria"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </AppShell>
  );
}
