import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/utils/route-head";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/logs")({
  component: Page,
  head: () =>
    routeHead({
      path: "/logs",
      title: "Logs",
      description:
        "Logs de auditoria e operações realizadas pelos usuários no Planeja IA.",
      noindex: true,
    }),
});

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  request_payload: unknown;
};

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () =>
      ((
        await supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200)
      ).data ?? []) as unknown as AuditRow[],
  });

  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: "quando",
      header: "Quando",
      width: "w-44",
      sortable: true,
      sortAccessor: (r) => new Date(r.created_at).getTime(),
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.created_at).toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      id: "acao",
      header: "Ação",
      width: "w-40",
      sortable: true,
      sortAccessor: (r) => r.action,
      cell: (r) => (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {r.action}
        </Badge>
      ),
    },
    {
      id: "entidade",
      header: "Entidade",
      width: "w-32",
      sortable: true,
      sortAccessor: (r) => r.entity_type,
      cell: (r) => <span className="text-xs">{r.entity_type}</span>,
    },
    {
      id: "payload",
      header: "Payload",
      cell: (r) => (
        <span className="block max-w-xl truncate font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(r.request_payload)}
        </span>
      ),
    },
  ];

  return (
    <AppShell
      title="Auditoria"
      subtitle="Ações realizadas no sistema (somente gestores e administradores)"
    >
      <DataTable<AuditRow>
        data={data ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={isLoading}
        pagination={{ pageSize: 50 }}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="Sem registros de auditoria"
            description="As ações sensíveis realizadas no sistema aparecerão aqui."
          />
        }
      />
    </AppShell>
  );
}
