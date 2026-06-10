import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import {
  prepararDadosPautaConsolidada,
  exportarPautaConsolidadaExcel,
} from "@/lib/excel-export";

interface PautaConsolidadaExporterProps {
  /** IDs de processos: o sistema gera 1 aba por processo. */
  processoIds?: string[];
  /** IDs de contratos: o sistema deriva os processos dos contratos e gera 1 aba por processo,
   *  trazendo TODOS os itens do processo (e não apenas os itens dos contratos selecionados). */
  contractIds?: string[];
  buttonClassName?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
}

export function PautaConsolidadaExporter({
  processoIds,
  contractIds,
  buttonClassName,
  variant = "outline",
  size = "sm",
  label = "Pauta Consolidada",
}: PautaConsolidadaExporterProps) {
  const [loading, setLoading] = useState(false);

  const handleGenerateXls = async () => {
    setLoading(true);
    toast.info(`Gerando Pauta Consolidada...`, { id: "pauta-export" });

    try {
      // 1) Resolver os IDs de processo a partir de processoIds OU contractIds
      let resolvedProcessoIds: string[] = [];
      if (processoIds && processoIds.length > 0) {
        resolvedProcessoIds = Array.from(new Set(processoIds.filter(Boolean)));
      } else if (contractIds && contractIds.length > 0) {
        const { data, error } = await supabase
          .from("contratos")
          .select("processo_id")
          .in("id", contractIds);
        if (error) throw error;
        resolvedProcessoIds = Array.from(
          new Set((data ?? []).map((r: any) => r.processo_id).filter(Boolean))
        );
      }

      if (resolvedProcessoIds.length === 0) {
        toast.error("Nenhum processo identificado para exportação.", {
          id: "pauta-export",
        });
        setLoading(false);
        return;
      }

      // 2) Buscar dados de TODOS os itens de cada processo via RPC
      //    (a função já retorna todos os itens do processo, não só do contrato)
      const processoBlocks: { processoId: string; raw: any[] }[] = [];
      for (const pid of resolvedProcessoIds) {
        const { data, error } = await supabase.rpc(
          "get_pauta_consolidada_data" as any,
          { p_processo_id: pid }
        );
        if (error) throw error;
        processoBlocks.push({ processoId: pid, raw: (data as any[]) ?? [] });
      }

      const allRaw = processoBlocks.flatMap((b) => b.raw);
      if (allRaw.length === 0) {
        toast.error("Nenhum dado encontrado para os processos selecionados.", {
          id: "pauta-export",
        });
        setLoading(false);
        return;
      }

      // 3) Preparar e exportar — múltiplos processos → 1 arquivo com várias abas
      const processes = prepararDadosPautaConsolidada(allRaw);

      const filename =
        resolvedProcessoIds.length === 1
          ? `pauta_consolidada_${resolvedProcessoIds[0]}.xlsx`
          : `pauta_consolidada_multiplos_processos.xlsx`;

      await exportarPautaConsolidadaExcel(processes, filename);

      toast.success(
        `Pauta Consolidada gerada (${processes.length} aba${processes.length > 1 ? "s" : ""}).`,
        { id: "pauta-export" }
      );
    } catch (e: any) {
      console.error("Error generating pauta:", e);
      toast.error("Erro ao exportar Pauta Consolidada", {
        description: e.message,
        id: "pauta-export",
      });
    } finally {
      setLoading(false);
    }
  };

  const disabled =
    loading ||
    ((!processoIds || processoIds.length === 0) &&
      (!contractIds || contractIds.length === 0));

  return (
    <Button
      variant={variant}
      size={size}
      className={buttonClassName}
      onClick={handleGenerateXls}
      disabled={disabled}
      title="Gerar planilha de Pauta Consolidada em formato Excel"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
      )}
      {label}
    </Button>
  );
}
