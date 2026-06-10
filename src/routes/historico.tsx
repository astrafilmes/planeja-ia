import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatNumber } from "@/lib/normalize";
import { Eye, History } from "lucide-react";

export const Route = createFileRoute("/historico")({ component: Page });

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["irp_jobs"],
    queryFn: async () =>
      (
        await supabase
          .from("irp_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  return (
    <AppShell title="Histórico" subtitle="Processamentos IRP anteriores">
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead className="w-32 text-right">Unidades</TableHead>
              <TableHead className="w-32 text-right">Itens</TableHead>
              <TableHead className="w-36 text-right">Valor</TableHead>
              <TableHead className="w-40">Quando</TableHead>
              <TableHead className="w-28 text-right">Status</TableHead>
              <TableHead className="w-24 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-[13px] text-slate-500 dark:text-slate-400"
                >
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={History}
                    title="Nenhum processamento ainda"
                    description="As análises IRP concluídas aparecerão neste histórico."
                  />
                </TableCell>
              </TableRow>
            )}
            {data?.map((j: any) => (
              <TableRow key={j.id}>
                <TableCell className="text-xs font-medium truncate max-w-md">
                  {j.original_filename}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(j.secretarias_com_itens)}/
                  {formatNumber(j.total_secretarias)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(j.total_linhas)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatBRL(Number(j.total_valor))}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <StatusBadge status={j.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/irp" search={{ job: j.id }}>
                      <Eye className="size-4" /> Abrir
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
