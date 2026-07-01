import { Link, createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/utils/route-head";
import { useQuery } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import { Eye, History } from "lucide-react";

export const Route = createFileRoute("/historico")({
  component: Page,
  head: () =>
    routeHead({
      path: "/historico",
      title: "Histórico",
      description:
        "Linha do tempo das alterações em processos, contratos e cadastros do Planeja IA.",
      noindex: true,
    }),
});

type JobRow = {
  id: string;
  original_filename: string;
  secretarias_com_itens: number | null;
  total_secretarias: number | null;
  total_linhas: number | null;
  total_valor: number | string | null;
  created_at: string;
  status: string;
};

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["irp_jobs"],
    queryFn: async () =>
      ((
        await supabase
          .from("irp_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? []) as unknown as JobRow[],
  });

  const columns: DataTableColumn<JobRow>[] = [
    {
      id: "arquivo",
      header: "Arquivo",
      cell: (r) => (
        <span className="block max-w-md truncate text-xs font-medium">
          {r.original_filename}
        </span>
      ),
      sortable: true,
      sortAccessor: (r) => r.original_filename ?? "",
    },
    {
      id: "unidades",
      header: "Unidades",
      align: "right",
      width: "w-32",
      cell: (r) => (
        <span className="font-mono text-xs">
          {formatNumber(Number(r.secretarias_com_itens ?? 0))}/
          {formatNumber(Number(r.total_secretarias ?? 0))}
        </span>
      ),
    },
    {
      id: "itens",
      header: "Itens",
      align: "right",
      width: "w-32",
      sortable: true,
      sortAccessor: (r) => Number(r.total_linhas ?? 0),
      cell: (r) => (
        <span className="font-mono text-xs">{formatNumber(Number(r.total_linhas ?? 0))}</span>
      ),
    },
    {
      id: "valor",
      header: "Valor",
      align: "right",
      width: "w-36",
      sortable: true,
      sortAccessor: (r) => Number(r.total_valor ?? 0),
      cell: (r) => <span className="font-mono text-xs">{formatBRL(Number(r.total_valor))}</span>,
    },
    {
      id: "quando",
      header: "Quando",
      width: "w-40",
      sortable: true,
      sortAccessor: (r) => new Date(r.created_at).getTime(),
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.created_at).toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "right",
      width: "w-28",
      cell: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <AppShell title="Histórico" subtitle="Processamentos IRP anteriores">
      <DataTable<JobRow>
        data={data ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={isLoading}
        pagination={{ pageSize: 25 }}
        emptyState={
          <EmptyState
            icon={History}
            title="Nenhum processamento ainda"
            description="As análises IRP concluídas aparecerão neste histórico."
          />
        }
        rowActions={(r) => (
          <Button asChild size="sm" variant="outline">
            <Link to="/irp" search={{ job: r.id }}>
              <Eye className="size-4" /> Abrir
            </Link>
          </Button>
        )}
      />
    </AppShell>
  );
}
