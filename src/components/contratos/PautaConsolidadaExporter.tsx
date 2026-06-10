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
  processoIds: string[];
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
  buttonClassName,
  variant = "outline",
  size = "sm",
  label = "Pauta Consolidada",
}: PautaConsolidadaExporterProps) {
  const [loading, setLoading] = useState(false);

  const handleGenerateXls = async () => {
    if (!processoIds || processoIds.length === 0) {
      toast.error("Nenhum processo selecionado para exportação.");
      return;
    }

    setLoading(true);
    toast.info(`Gerando Pauta Consolidada...`, { id: "pauta-export" });

    try {
      let allRawData: any[] = [];

      for (const id of processoIds) {
        const { data, error } = await supabase.rpc("get_pauta_consolidada_data" as any, {
          p_processo_id: id,
        });
        
        const rawData = data as any[];

        if (error) {
          throw error;
        }

        if (rawData && rawData.length > 0) {
          allRawData = allRawData.concat(rawData);
        }
      }

      if (allRawData.length === 0) {
        toast.error("Nenhum dado encontrado para os processos selecionados.", {
          id: "pauta-export",
        });
        setLoading(false);
        return;
      }

      // 1. Process and map the data
      const processes = prepararDadosPautaConsolidada(allRawData);

      // 2. Export to Excel
      const filename =
        processoIds.length === 1
          ? `pauta_consolidada_${processoIds[0]}.xlsx`
          : `pauta_consolidada_multiplos_processos.xlsx`;

      await exportarPautaConsolidadaExcel(processes, filename);

      toast.success(`Pauta Consolidada gerada com sucesso!`, {
        id: "pauta-export",
      });
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

  return (
    <Button
      variant={variant}
      size={size}
      className={buttonClassName}
      onClick={handleGenerateXls}
      disabled={loading || processoIds.length === 0}
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
