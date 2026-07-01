import { ChevronRight, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PautaConsolidadaExporter } from "@/components/contratos/PautaConsolidadaExporter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { Processo } from "../lib";

export interface ProcessoHeaderProps {
  processo: Processo;
  processoId: string;
  isSyncing: boolean;
  canSync: boolean;
  dirty: boolean;
  onSync: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function ProcessoHeader({
  processo,
  processoId,
  isSyncing,
  canSync,
  dirty,
  onSync,
  onSave,
  onDelete,
}: ProcessoHeaderProps) {
  const objetoLongo = (processo.objeto ?? "").length > 220;
  const titulo = `Processo ${processo.numero_processo ?? "sem número"}`;

  return (
    <PageHeader
      breadcrumb={
        <div className="flex items-center gap-1.5 uppercase tracking-wide">
          <span>Planejamento</span>
          <ChevronRight className="size-3" />
          <span className="truncate text-foreground">{titulo}</span>
        </div>
      }
      title={titulo}
      subtitle={processo.objeto}
      onBack={() => window.history.back()}
      secondaryActions={
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSyncing || !canSync}
            onClick={onSync}
            title="Sincronizar dados do processo com o M2A"
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Sincronizar M2A
          </Button>
          <PautaConsolidadaExporter
            processoIds={[processoId]}
            variant="outline"
            size="sm"
          />
          {objetoLongo && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Ler mais
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Objeto do processo</DialogTitle>
                </DialogHeader>
                <p className="text-sm leading-6 text-muted-foreground">
                  {processo.objeto}
                </p>
              </DialogContent>
            </Dialog>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="size-4" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
                <AlertDialogDescription>
                  O processo será ocultado das listagens, preservando o
                  histórico para auditoria.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
      primaryAction={
        <Button size="sm" onClick={onSave} disabled={!dirty}>
          <Save className="size-4" /> Salvar
        </Button>
      }
    />
  );
}
