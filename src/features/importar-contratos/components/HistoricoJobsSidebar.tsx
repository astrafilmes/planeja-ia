import { memo } from "react";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";
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
import { formatBRL } from "@/lib/utils/normalize";
import type { JobRow } from "../lib";

type Props = {
  jobs: JobRow[];
  activeJobId: string | null;
  onSelectJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
  onNewImport?: () => void;
};

/**
 * Lista lateral de importações recentes.
 */
export const HistoricoJobsSidebar = memo(function HistoricoJobsSidebar({
  jobs,
  activeJobId,
  onSelectJob,
  onDeleteJob,
  onNewImport,
}: Props) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm">Recentes</CardTitle>
        {onNewImport && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={onNewImport}
          >
            <Plus className="size-3.5" />
            Nova
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {jobs.map((j) => (
            <div
              key={j.id}
              className={`group relative w-full border-b border-border/60 transition-colors hover:bg-muted/40 ${
                activeJobId === j.id ? "bg-muted/40 dark:bg-slate-800/50" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectJob(j.id)}
                className="w-full text-left px-4 py-2.5 pr-10"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[13px] font-medium">
                    {j.empresa ?? "—"}
                  </div>
                  <Badge
                    variant={j.status === "autorizado" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {j.status}
                  </Badge>
                </div>
                <div className="mt-1 flex gap-3 text-[12px] text-muted-foreground">
                  <span>{j.total_itens} itens</span>
                  <span>{j.total_contratos_previstos} contratos</span>
                  <span>{formatBRL(j.total_valor)}</span>
                </div>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-1.5 right-1.5 size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                      "{j.original_filename}" será removida com seus itens e
                      dotações em revisão. Contratos já gerados não são afetados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleteJob(j.id)}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}

          {jobs.length === 0 && (
            <EmptyState
              icon={FileSpreadsheet}
              title="Nenhuma importação ainda"
              description="Envie uma planilha para criar a primeira revisão."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
});
