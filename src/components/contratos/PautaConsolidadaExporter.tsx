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
  /** IDs de processos: gera 1 aba por processo com TODOS os contratos do processo. */
  processoIds?: string[];
  /** IDs de contratos selecionados: gera 1 aba por processo, mas filtrando apenas
   *  os contratos selecionados (não traz todos os contratos do processo). */
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

function buildProcessoNome(p: { numero_processo?: string | null; ano?: number | null; modalidade?: string | null }) {
  const num = (p.numero_processo || "").toString().trim();
  const ano = p.ano ? String(p.ano) : "";
  const mod = (p.modalidade || "").toString().trim().toUpperCase();
  let base = num;
  if (ano) base = base ? `${base}/${ano}` : ano;
  if (mod) base = base ? `${base}-${mod}` : mod;
  return base || "Processo";
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
      // 1) Resolver IDs de processo + (opcional) lista de contratos selecionados
      let resolvedProcessoIds: string[] = [];
      let selectedContractIds: Set<string> | null = null;

      if (contractIds && contractIds.length > 0) {
        selectedContractIds = new Set(contractIds);
        const { data, error } = await supabase
          .from("contratos")
          .select("id, processo_id")
          .in("id", contractIds);
        if (error) throw error;
        resolvedProcessoIds = Array.from(
          new Set((data ?? []).map((r: any) => r.processo_id).filter(Boolean))
        );
      } else if (processoIds && processoIds.length > 0) {
        resolvedProcessoIds = Array.from(new Set(processoIds.filter(Boolean)));
      }

      if (resolvedProcessoIds.length === 0) {
        toast.error("Nenhum processo identificado para exportação.", {
          id: "pauta-export",
        });
        setLoading(false);
        return;
      }

      // 2) Buscar nomes dos processos
      const { data: processosData, error: procErr } = await supabase
        .from("processos")
        .select("id, numero_processo, ano, modalidade")
        .in("id", resolvedProcessoIds);
      if (procErr) throw procErr;
      const nomeByProcessoId = new Map<string, string>();
      (processosData ?? []).forEach((p: any) => {
        nomeByProcessoId.set(p.id, buildProcessoNome(p));
      });

      // 3) Buscar dados via RPC por processo. Sempre traz TODOS os itens do processo;
      //    itens fora dos contratos selecionados vêm com quantidade 0 (flag no_contrato=true).
      const allRaw: any[] = [];
      for (const pid of resolvedProcessoIds) {
        const contratoIdsForRpc = selectedContractIds
          ? Array.from(selectedContractIds)
          : null;
        const { data, error } = await supabase.rpc(
          "get_pauta_consolidada_full" as any,
          { p_processo_id: pid, p_contrato_ids: contratoIdsForRpc },
        );
        if (error) throw error;
        const rows = (data as any[]) ?? [];
        for (const r of rows) {
          allRaw.push({ ...r, processo_nome: nomeByProcessoId.get(pid) || pid });
        }
      }


      if (allRaw.length === 0) {
        toast.error("Nenhum dado encontrado para os contratos/processos selecionados.", {
          id: "pauta-export",
        });
        setLoading(false);
        return;
      }

      // 4) Preparar + exportar
      const processes = prepararDadosPautaConsolidada(allRaw);

      const filename =
        processes.length === 1
          ? `pauta_consolidada_${(processes[0].processo_nome || processes[0].processo_id).replace(/[\\/*?:[\]]/g, "_")}.xlsx`
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
