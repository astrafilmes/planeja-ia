import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "@/contexts/ProgressContext";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { readWorkbook, analisar, type AnaliseIRP } from "@/lib/irp";
import type { UnidadeIrp } from "../lib";
import { useIrpSalvarResultado } from "./useIrpSalvarResultado";

export interface UseIrpUploadAnaliseOptions {
  unidades: UnidadeIrp[] | undefined;
  onBeforeAnalisar: () => void;
  onJobCriado: (jobId: string) => void;
}

export interface UseIrpUploadAnaliseResult {
  file: File | null;
  setFile: (f: File | null) => void;
  analise: AnaliseIRP | null;
  setAnalise: (a: AnaliseIRP | null) => void;
  progress: number;
  busy: boolean;
  handleAnalisar: () => Promise<void>;
}

export function useIrpUploadAnalise({
  unidades,
  onBeforeAnalisar,
  onJobCriado,
}: UseIrpUploadAnaliseOptions): UseIrpUploadAnaliseResult {
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const { persistirArquivosResultado } = useIrpSalvarResultado();
  const [file, setFile] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseIRP | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleAnalisar = useCallback(async () => {
    if (!file || !unidades) return;
    onBeforeAnalisar();
    setBusy(true);
    setProgress(10);
    startTask("Analisando IRP", "Lendo a planilha enviada...");
    try {
      const matrix = await readWorkbook(file);
      setProgress(40);
      updateProgress(40, "Identificando colunas e unidades...");
      const a = analisar(matrix, unidades);
      setAnalise(a);
      setProgress(70);
      updateProgress(70, "Registrando resultado da análise...");

      const { data: jobRow, error } = await supabase
        .from("irp_jobs")
        .insert({
          original_filename: file.name,
          status: "analyzed",
          linha_cabecalho: a.linhaCabecalho,
          idx_natureza: a.idxNatureza,
          idx_descricao: a.idxDescricao,
          idx_especificacao: a.idxEspecificacao,
          idx_unidade: a.idxUnidade,
          total_secretarias: a.resultados.length,
          secretarias_com_itens: a.resultados.filter(
            (r) => r.itens.length > 0,
          ).length,
          secretarias_sem_itens: a.resultados.filter(
            (r) => r.itens.length === 0,
          ).length,
          total_linhas: a.resultados.reduce((s, r) => s + r.itens.length, 0),
          total_valor: a.resultados.reduce((s, r) => s + r.somaValor, 0),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      onJobCriado(jobRow.id);

      const { error: secretariasError } = await supabase
        .from("irp_job_secretarias")
        .insert(
          a.resultados.map((r) => ({
            job_id: jobRow.id,
            unidade_id: r.unidade.id,
            numero: r.unidade.numero,
            nome: r.unidade.nome,
            ref_coluna: r.unidade.ref_coluna,
            cabecalho_coluna: r.cabecalhoColuna,
            itens_validos: r.itens.length,
            soma_valor: r.somaValor,
            status: r.status,
            erro: r.erro ?? null,
          })),
        );
      if (secretariasError) throw secretariasError;

      await persistirArquivosResultado(jobRow.id, file, a);
      setAnalise({
        ...a,
        resultados: a.resultados.map((r) =>
          r.itens.length > 0 ? { ...r, status: "exportado" } : r,
        ),
      });

      await logAudit({
        action: "irp_analyze",
        entityType: "irp_job",
        entityId: jobRow.id,
        payload: { filename: file.name, total: a.resultados.length },
      });
      setProgress(100);
      finishTask(`Planilha analisada: ${a.resultados.length} unidade(s).`);
      notify.success(`Planilha analisada: ${a.resultados.length} unidades`);
    } catch (e: any) {
      failTask(e?.message ?? "Falha na análise IRP.");
      notify.error("Falha na análise", { description: e?.message });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }, [
    failTask,
    file,
    finishTask,
    onBeforeAnalisar,
    onJobCriado,
    persistirArquivosResultado,
    startTask,
    unidades,
    updateProgress,
  ]);

  return {
    file,
    setFile,
    analise,
    setAnalise,
    progress,
    busy,
    handleAnalisar,
  };
}
