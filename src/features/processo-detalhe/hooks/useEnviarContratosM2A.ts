import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import { useM2AConnection } from "@/contexts/M2AConnectionProvider";
import { useM2APreferences } from "@/hooks/useM2APreferences";
import {
  filterServidoresByUnidade,
  useServidores,
} from "@/hooks/useM2ACatalog";
import {
  ETAPAS_ORDEM,
  buildM2AContractPayload,
  diagnoseM2A,
  extractM2AProcessoId,
  isNumericM2AId,
  listenAllM2AProgress,
  sendToM2A,
} from "@/lib/m2a";
import { sleep, type ContratoRow, type Processo } from "../lib";

type Params = {
  processoId: string;
  processo: Processo | null | undefined;
  contratos: ContratoRow[];
  selected: Set<string>;
  clearSelection: () => void;
};

export function useEnviarContratosM2A({
  processoId,
  processo,
  contratos,
  selected,
  clearSelection: _clearSelection,
}: Params) {
  const qc = useQueryClient();
  const { connected, ensureConnected } = useM2AConnection();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const m2aBatchRef = useRef({ total: 0, finished: 0 });

  const [batchStatus, setBatchStatus] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [m2aDialogOpen, setM2aDialogOpen] = useState(false);
  const [m2aFiscalId, setM2aFiscalId] = useState<string>("");
  const [m2aContratoData, setM2aContratoData] = useState<string>("");

  const { data: m2aFiscais = [] } = useServidores("FISCAL");

  const selectedContracts = useMemo(
    () => contratos.filter((c) => selected.has(c.id)),
    [contratos, selected],
  );

  const selectedUnidadeIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedContracts
            .map((c) => c.m2a_orgao_id)
            .filter((v): v is string => Boolean(v)),
        ),
      ),
    [selectedContracts],
  );

  const shouldAskFiscal = selectedContracts.length === 1;
  const preferenceUnidadeGestoraId =
    selectedUnidadeIds.length === 1 ? selectedUnidadeIds[0] : null;
  const { preference, savePreference } = useM2APreferences(
    preferenceUnidadeGestoraId,
  );

  const filteredFiscais = useMemo(() => {
    if (selectedUnidadeIds.length === 1) {
      return filterServidoresByUnidade(m2aFiscais, selectedUnidadeIds[0]);
    }
    if (selectedUnidadeIds.length > 1) {
      return m2aFiscais.filter((fiscal) =>
        fiscal.unidades_gestoras.some((u) =>
          selectedUnidadeIds.includes(u.m2a_id),
        ),
      );
    }
    return m2aFiscais;
  }, [m2aFiscais, selectedUnidadeIds]);

  useEffect(() => {
    if (!preference) return;
    if (preference.data_padrao) setM2aContratoData(preference.data_padrao);
    if (preference.fiscal_id) setM2aFiscalId(preference.fiscal_id);
  }, [preference]);

  // Listener global de progresso — limpo no cleanup para evitar memory leak.
  useEffect(() => {
    const off = listenAllM2AProgress(async (event) => {
      const contratoAtual = contratos.find((c) => c.id === event.contratoId);
      const belongsToProcess = Boolean(contratoAtual);
      if (!belongsToProcess) return;

      const total = Math.max(m2aBatchRef.current.total, 1);
      const etapaIndex = Math.max(ETAPAS_ORDEM.indexOf(event.etapa), 0);
      const etapaProgress =
        event.etapa === "concluido"
          ? 1
          : event.etapa === "erro"
            ? 1
            : etapaIndex / Math.max(ETAPAS_ORDEM.length - 1, 1);
      const progress =
        ((m2aBatchRef.current.finished + etapaProgress) / total) * 100;

      if (event.etapa !== "concluido" && event.etapa !== "erro") {
        updateProgress(
          progress,
          `${contratoAtual?.numero_contrato ?? "Contrato"}: ${event.mensagem}`,
        );
      }

      if (event.etapa === "concluido") {
        m2aBatchRef.current.finished += 1;
        updateProgress(
          (m2aBatchRef.current.finished / total) * 100,
          `${contratoAtual?.numero_contrato ?? "Contrato"} enviado com sucesso.`,
        );
        setBatchStatus((status) => ({
          ...status,
          [event.contratoId]: "sucesso",
        }));
        await supabase
          .from("contratos")
          .update({
            status_envio_m2a: "sucesso",
            enviado_m2a_em: new Date().toISOString(),
            m2a_contrato_id: event.m2a_contrato_id ?? null,
            m2a_documentos_gerados: (event.documentosM2A ?? []) as any,
            ultimo_erro_m2a: null,
          })
          .eq("id", event.contratoId);
        qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
        if (m2aBatchRef.current.finished >= total) {
          finishTask("Envio ao portal concluído.");
        }
      }

      if (event.etapa === "erro") {
        m2aBatchRef.current.finished += 1;
        failTask(event.mensagem || "Falha no envio ao portal.");
        setBatchStatus((status) => ({
          ...status,
          [event.contratoId]: "erro",
        }));
        await supabase
          .from("contratos")
          .update({
            status_envio_m2a: "erro",
            ultimo_erro_m2a: event.mensagem,
          })
          .eq("id", event.contratoId);
        qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      }
    });
    return () => {
      off?.();
    };
  }, [contratos, failTask, finishTask, processoId, qc, updateProgress]);

  const validateM2AConfig = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      notify.error("Nenhum contrato selecionado.");
      return null;
    }
    if (shouldAskFiscal && !m2aFiscalId) {
      notify.error("Selecione o fiscal do contrato.");
      return null;
    }
    if (!m2aContratoData) {
      notify.error("Informe a data do contrato.");
      return null;
    }
    if (!processo?.m2a_url || !extractM2AProcessoId(processo.m2a_url)) {
      notify.error("Processo sem URL externa válida.", {
        description:
          "Informe e salve o link do processo no portal antes de enviar contratos.",
      });
      return null;
    }
    if (shouldAskFiscal && !isNumericM2AId(m2aFiscalId)) {
      notify.error("IDs externos inválidos.", {
        description: "Fiscal deve usar apenas código numérico.",
      });
      return null;
    }

    const invalidos = selectedContracts.filter(
      (c) =>
        !c.m2a_orgao_id ||
        !isNumericM2AId(c.m2a_orgao_id) ||
        !c.m2a_dot_orgao_id ||
        !isNumericM2AId(c.m2a_dot_orgao_id) ||
        !c.m2a_uo_id ||
        !isNumericM2AId(c.m2a_uo_id) ||
        !c.m2a_dot_id ||
        !isNumericM2AId(c.m2a_dot_id) ||
        (!shouldAskFiscal &&
          (!c.m2a_fiscal_codigo || !isNumericM2AId(c.m2a_fiscal_codigo))) ||
        !c.m2a_gestor_codigo ||
        !isNumericM2AId(c.m2a_gestor_codigo),
    );
    if (invalidos.length > 0) {
      notify.error("Contrato sem cadastro externo completo.", {
        description:
          "A secretaria do contrato precisa ter Unidade Gestora, Órgão da Dotação, UO, Dotação e Gestor cadastrados.",
      });
      console.table(
        invalidos.map((c) => ({
          contrato: c.numero_contrato,
          secretaria: c.secretaria_sigla,
          unidade_gestora: c.m2a_orgao_id,
          orgao_dotacao: c.m2a_dot_orgao_id,
          unidade_orcamentaria: c.m2a_uo_id,
          despesa_projeto_atividade: c.m2a_dot_id,
          fiscal_id: c.m2a_fiscal_codigo,
          gestor_id: c.m2a_gestor_codigo,
        })),
      );
      return null;
    }

    const semItens = selectedContracts.filter((c) => c.itens.length === 0);
    if (semItens.length > 0) {
      notify.error("Contrato sem itens para envio.", {
        description:
          "A automação precisa dos itens importados para adicionar e ajustar quantidades.",
      });
      console.table(
        semItens.map((c) => ({
          contrato: c.numero_contrato,
          secretaria: c.secretaria_sigla,
        })),
      );
      return null;
    }

    const semAta = selectedContracts.filter(
      (c) => !c.m2a_ata_id || !isNumericM2AId(c.m2a_ata_id),
    );
    if (semAta.length > 0) {
      notify.error("Contrato sem ata definida.", {
        description:
          "Revise a importação: cada contrato precisa carregar a ata correta dos seus itens.",
      });
      console.table(
        semAta.map((c) => ({
          contrato: c.numero_contrato,
          secretaria: c.secretaria_sigla,
          fornecedor: c.fornecedor_nome ?? c.preposto,
          ata_m2a: c.m2a_ata_id,
        })),
      );
      return null;
    }

    return { ids };
  }, [
    selected,
    shouldAskFiscal,
    m2aFiscalId,
    m2aContratoData,
    processo?.m2a_url,
    selectedContracts,
  ]);

  const buildM2APayload = useCallback(
    (cid: string) => {
      const contrato = contratos.find((c) => c.id === cid);
      if (!contrato) return null;
      const dataContrato = m2aContratoData;
      const dadosDotacao = {
        orgao: contrato.m2a_dot_orgao_id,
        unidade_orcamentaria: contrato.m2a_uo_id,
        despesa_projeto_atividade: contrato.m2a_dot_id,
      };
      return buildM2AContractPayload({
        contratoId: cid,
        m2aProcessoUrl: processo?.m2a_url,
        m2aAtaId: contrato.m2a_ata_id,
        contrato: {
          numero_contrato: contrato.numero_contrato,
          m2a_contrato_id: contrato.m2a_contrato_id,
          objeto: contrato.objeto,
          data: dataContrato,
          preposto: contrato.preposto,
        },
        itens: contrato.itens,
        dotacao: dadosDotacao,
        unidadeGestoraId: contrato.m2a_orgao_id,
        fiscalId: shouldAskFiscal ? m2aFiscalId : contrato.m2a_fiscal_codigo,
        gestorId: contrato.m2a_gestor_codigo,
        secretariaNome: contrato.secretaria_nome ?? null,
      });
    },
    [contratos, m2aContratoData, processo?.m2a_url, shouldAskFiscal, m2aFiscalId],
  );

  const handleDiagnoseM2A = useCallback(() => {
    if (!ensureConnected()) return;
    const config = validateM2AConfig();
    if (!config) return;
    const payload = buildM2APayload(config.ids[0]);
    if (!payload) return;
    notify.info("Diagnóstico iniciado. Veja o console da aba do portal.");
    diagnoseM2A(payload as any);
  }, [ensureConnected, validateM2AConfig, buildM2APayload]);

  const handleSendSelectedToM2A = useCallback(async () => {
    if (!ensureConnected()) return;
    const config = validateM2AConfig();
    if (!config) return;

    setSending(true);
    setM2aDialogOpen(false);
    m2aBatchRef.current = { total: config.ids.length, finished: 0 };
    startTask(
      "Enviando contratos ao portal",
      `Preparando ${config.ids.length} contrato(s)...`,
    );
    notify.info(
      `Iniciando envio sequencial de ${config.ids.length} contrato(s)...`,
    );

    const { error: dataError } = await supabase
      .from("contratos")
      .update({ data: m2aContratoData })
      .in("id", config.ids);
    if (dataError) {
      setSending(false);
      failTask(dataError.message);
      notify.error("Falha ao salvar a data dos contratos.", {
        description: dataError.message,
      });
      return;
    }

    for (const cid of config.ids) {
      setBatchStatus((s) => ({ ...s, [cid]: "processando" }));
      const payload = buildM2APayload(cid);
      if (!payload) continue;
      const currentIndex = config.ids.indexOf(cid) + 1;
      const contratoAtual = contratos.find((item) => item.id === cid);
      updateProgress(
        ((currentIndex - 1) / Math.max(config.ids.length, 1)) * 100,
        `Despachando ${contratoAtual?.numero_contrato ?? "contrato"} (${currentIndex} de ${config.ids.length})...`,
      );

      const contrato = contratos.find((item) => item.id === cid);
      if (
        shouldAskFiscal &&
        contrato?.m2a_orgao_id &&
        payload.dadosM2A.fiscal_id
      ) {
        await savePreference({
          unidade_gestora_id: contrato.m2a_orgao_id,
          secretaria_id: contrato.secretaria_id,
          data_padrao: payload.contrato.data as string,
          fiscal_id: payload.dadosM2A.fiscal_id as string,
          gestor_id: payload.dadosM2A.gestor_id as string,
        });
      }

      sendToM2A(payload as any);
      await sleep(3000);
    }

    setSending(false);
    notify.success(
      `${config.ids.length} envio(s) iniciado(s) no worker M2A.`,
    );
    qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
  }, [
    ensureConnected,
    validateM2AConfig,
    startTask,
    m2aContratoData,
    failTask,
    buildM2APayload,
    contratos,
    updateProgress,
    shouldAskFiscal,
    savePreference,
    qc,
    processoId,
  ]);

  return {
    // state
    batchStatus,
    sending,
    connected,
    m2aDialogOpen,
    setM2aDialogOpen,
    m2aFiscalId,
    setM2aFiscalId,
    m2aContratoData,
    setM2aContratoData,
    // memos
    selectedContracts,
    selectedUnidadeIds,
    shouldAskFiscal,
    filteredFiscais,
    // actions
    handleDiagnoseM2A,
    handleSendSelectedToM2A,
  };
}
