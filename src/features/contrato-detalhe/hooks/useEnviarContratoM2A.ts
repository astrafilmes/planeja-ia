import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import { useM2AConnection } from "@/contexts/M2AConnectionProvider";
import { useM2APreferences } from "@/hooks/useM2APreferences";
import {
  ETAPA_LABEL,
  ETAPAS_ORDEM,
  buildM2AContractPayload,
  extractM2AProcessoId,
  isNumericM2AId,
  listenM2AProgress,
  sendToM2A,
  type M2AEtapa,
  type M2AProgressEvent,
} from "@/lib/m2a";
import type { ContratoFull } from "../lib";

export function useEnviarContratoM2A(
  id: string,
  contrato: ContratoFull | null | undefined,
  refetch: () => void,
) {
  const { connected, ensureConnected } = useM2AConnection();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const [logs, setLogs] = useState<M2AProgressEvent[]>([]);
  const [etapaAtual, setEtapaAtual] = useState<M2AEtapa | null>(null);
  const [enviando, setEnviando] = useState(false);

  const unidadeGestoraId = contrato?.secretaria?.m2a_orgao_id ?? null;
  const { preference, savePreference } = useM2APreferences(unidadeGestoraId);

  // Listener de progresso — cleanup via off() no desmonte para evitar
  // vazamento de memória enquanto atualizações do M2A ainda estão em curso.
  useEffect(() => {
    const off = listenM2AProgress(id, async (e) => {
      setLogs((l) => [...l, e]);
      setEtapaAtual(e.etapa);
      if (e.m2a_contrato_id && e.m2a_contrato_id !== contrato?.contrato.m2a_contrato_id) {
        await supabase
          .from("contratos")
          .update({ m2a_contrato_id: e.m2a_contrato_id })
          .eq("id", id);
      }
      const etapaIndex = Math.max(ETAPAS_ORDEM.indexOf(e.etapa), 0);
      const etapaProgress =
        e.etapa === "concluido" || e.etapa === "erro"
          ? 100
          : (etapaIndex / Math.max(ETAPAS_ORDEM.length - 1, 1)) * 100;
      if (e.etapa !== "concluido" && e.etapa !== "erro") {
        updateProgress(
          etapaProgress,
          ETAPA_LABEL[e.etapa]
            ? `${ETAPA_LABEL[e.etapa]}: ${e.mensagem}`
            : e.mensagem,
        );
      }
      await supabase.from("m2a_envio_logs").insert({
        contrato_id: id,
        etapa: e.etapa,
        sucesso: !!e.sucesso,
        http_status: e.http_status,
        duracao_ms: e.duracao_ms,
        mensagem: e.mensagem,
      });
      if (e.etapa === "concluido") {
        await supabase
          .from("contratos")
          .update({
            status_envio_m2a: "sucesso",
            enviado_m2a_em: new Date().toISOString(),
            m2a_contrato_id: e.m2a_contrato_id ?? null,
            m2a_documentos_gerados: (e.documentosM2A ?? []) as any,
            ultimo_erro_m2a: null,
          })
          .eq("id", id);
        notify.success("Contrato enviado ao portal M2A");
        finishTask("Contrato enviado ao portal com sucesso.");
        setEnviando(false);
        refetch();
      } else if (e.etapa === "erro") {
        // Mesmo em erro, salvamos o m2a_contrato_id se o worker conseguiu
        // criar o cabeçalho — a próxima tentativa retoma o pipeline em vez
        // de tentar criar de novo (o que geraria duplicidade).
        await supabase
          .from("contratos")
          .update({
            status_envio_m2a: "erro",
            ultimo_erro_m2a: e.mensagem,
            ...(e.m2a_contrato_id ? { m2a_contrato_id: e.m2a_contrato_id } : {}),
          })
          .eq("id", id);
        notify.error(e.mensagem);
        failTask(e.mensagem);
        setEnviando(false);
        refetch();
      }
    });
    return () => {
      off?.();
    };
  }, [contrato?.contrato.m2a_contrato_id, failTask, finishTask, id, refetch, updateProgress]);

  const pct = useMemo(() => {
    const idx = etapaAtual ? ETAPAS_ORDEM.indexOf(etapaAtual) : -1;
    if (etapaAtual === "concluido" || etapaAtual === "erro") return 100;
    if (idx >= 0) return Math.round(((idx + 1) / ETAPAS_ORDEM.length) * 100);
    return 0;
  }, [etapaAtual]);

  const handleEnviar = useCallback(async () => {
    if (!contrato) return;
    if (!ensureConnected()) return;
    const m2aUrl = contrato.processo?.m2a_url;
    const m2aId =
      contrato.processo?.m2a_processo_id || extractM2AProcessoId(m2aUrl);
    if (!m2aUrl || !m2aId)
      return notify.error("O processo não tem URL externa configurada.");
    const secretaria = contrato.secretaria;
    if (!secretaria) {
      return notify.error("Contrato sem secretaria vinculada.");
    }
    const ataId = contrato.contrato.m2a_ata_id;
    const dadosDotacao = {
      orgao: secretaria?.m2a_dot_orgao_id,
      unidade_orcamentaria: secretaria?.m2a_uo_id,
      despesa_projeto_atividade: secretaria?.m2a_dot_id,
    };
    const missing = [
      !ataId ? "Ata" : null,
      ataId && !isNumericM2AId(ataId) ? "Ata" : null,
      !isNumericM2AId(secretaria?.m2a_orgao_id) ? "Unidade Gestora" : null,
      !isNumericM2AId(secretaria?.m2a_dot_orgao_id) ? "Órgão da Dotação" : null,
      !isNumericM2AId(secretaria?.m2a_fiscal_codigo) ? "Fiscal" : null,
      !isNumericM2AId(secretaria?.m2a_gestor_codigo) ? "Gestor" : null,
      !isNumericM2AId(secretaria?.m2a_uo_id) ? "Unidade Orçamentária" : null,
      !isNumericM2AId(secretaria?.m2a_dot_id) ? "Dotação" : null,
    ].filter(Boolean);

    if (missing.length) {
      return notify.error("Cadastro externo incompleto", {
        description: `Complete: ${missing.join(", ")}.`,
      });
    }

    const dataContrato = contrato.contrato.data;
    if (!dataContrato) {
      return notify.error("Informe a data do contrato antes do envio.");
    }

    let payload;
    try {
      payload = buildM2AContractPayload({
        contratoId: id,
        m2aProcessoUrl: m2aUrl,
        m2aAtaId: ataId,
        contrato: {
          ...contrato.contrato,
          data: preference?.data_padrao ?? dataContrato,
        },
        itens: contrato.itens,
        dotacao: dadosDotacao,
        unidadeGestoraId: secretaria.m2a_orgao_id,
        fiscalId: preference?.fiscal_id ?? secretaria.m2a_fiscal_codigo,
        gestorId: preference?.gestor_id ?? secretaria.m2a_gestor_codigo,
        secretariaNome: secretaria.nome ?? null,
      });
    } catch (error) {
      return notify.error((error as Error).message);
    }

    setLogs([]);
    setEnviando(true);
    setEtapaAtual("validacao");
    startTask(
      "Enviando contrato ao portal",
      `Preparando ${contrato.contrato.numero_contrato}...`,
    );
    await supabase
      .from("contratos")
      .update({ status_envio_m2a: "processando", ultimo_erro_m2a: null })
      .eq("id", id);

    await savePreference({
      unidade_gestora_id: secretaria.m2a_orgao_id || "",
      secretaria_id: contrato.contrato.secretaria_id,
      data_padrao: payload.contrato.data as string,
      fiscal_id: payload.dadosM2A.fiscal_id as string,
      gestor_id: payload.dadosM2A.gestor_id as string,
    });

    sendToM2A(payload as any);
  }, [
    contrato,
    ensureConnected,
    id,
    preference,
    savePreference,
    startTask,
  ]);

  return {
    logs,
    etapaAtual,
    enviando,
    pct,
    connected,
    handleEnviar,
  };
}
