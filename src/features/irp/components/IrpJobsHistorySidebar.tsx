import { FileSpreadsheet, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import type { IrpJobListItem } from "../hooks/useIrpJobsList";

export interface IrpJobsHistorySidebarProps {
  jobs: IrpJobListItem[];
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onExcluirJob: (jobId: string) => void;
}

export function IrpJobsHistorySidebar({
  jobs,
  activeJobId,
  onSelectJob,
  onExcluirJob,
}: IrpJobsHistorySidebarProps) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="pb-3">
        <CardTitle>Importações recentes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {jobs.map((j) => {
            const isActive = activeJobId === j.id;
            return (
              <div
                key={j.id}
                className={`group relative w-full border-b border-border/60 transition-colors hover:bg-muted/40 ${
                  isActive ? "bg-muted/40 dark:bg-slate-800/50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectJob(j.id)}
                  className="w-full px-4 py-2.5 pr-10 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[13px] font-medium">
                      {j.original_filename ?? "—"}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {j.status ?? "—"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-[12px] text-muted-foreground">
                    <span>
                      {j.secretarias_com_itens ?? 0}/
                      {j.total_secretarias ?? 0} secretarias
                    </span>
                    <span>{formatNumber(j.total_linhas ?? 0)} itens</span>
                    <span>{formatBRL(Number(j.total_valor ?? 0))}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {j.created_at
                      ? new Date(j.created_at).toLocaleString("pt-BR")
                      : ""}
                  </div>
                </button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-1.5 top-1.5 size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => e.stopPropagation()}
                      title="Excluir importação"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{j.original_filename}" será removida do histórico.
                        Arquivos já gerados nas secretarias não serão afetados.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onExcluirJob(j.id)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}

          {jobs.length === 0 && (
            <EmptyState
              icon={FileSpreadsheet}
              title="Nenhuma importação ainda"
              description="Envie uma planilha consolidada para criar o primeiro registro."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
