import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "@/contexts/ProgressContext";
import { useM2AConnection } from "@/contexts/M2AConnectionProvider";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import {
  criarProcessoComumM2A,
  criarProcessoSrpM2A,
  type M2AComumPayload,
  type M2ASrpPayload,
} from "@/lib/m2a";
import type {
  IrpImportRow,
  ProcessoM2AForm,
  SecretariaM2A,
} from "../lib";
import type { EnrichedM2AIds } from "./useIrpImportRows";

export interface UseEnviarProcessoM2AOptions {
  jobId: string | null;
  processoM2AForm: ProcessoM2AForm;
  selectedImportRows: IrpImportRow[];
  rowsMissingM2A: IrpImportRow[];
  secretariasM2A: SecretariaM2A[];
  enrichRowForM2A: (row: IrpImportRow) => EnrichedM2AIds;
}

export interface UseEnviarProcessoM2AResult {
  busy: boolean;
  m2aConfirmOpen: boolean;
  setM2aConfirmOpen: (open: boolean) => void;
  abrirConfirmacaoProcessoM2A: () => void;
  confirmarCriacaoProcessoM2A: () => Promise<void>;
}

export function useEnviarProcessoM2A({
  jobId,
  processoM2AForm,
  selectedImportRows,
  rowsMissingM2A,
  secretariasM2A,
  enrichRowForM2A,
}: UseEnviarProcessoM2AOptions): UseEnviarProcessoM2AResult {
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const { ensureConnected } = useM2AConnection();
  const [busy, setBusy] = useState(false);
  const [m2aConfirmOpen, setM2aConfirmOpen] = useState(false);

  // Ref para cleanup do listener assíncrono do M2A (blindagem de memória).
  const m2aProcessOffRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      m2aProcessOffRef.current?.();
      m2aProcessOffRef.current = null;
    };
  }, []);

  const abrirConfirmacaoProcessoM2A = useCallback(() => {
    if (!ensureConnected()) return;
    if (!selectedImportRows.length) {
      notify.error("Selecione ao menos uma planilha para importar.");
      return;
    }
    if (rowsMissingM2A.length > 0) {
      notify.error("Ha planilhas sem IDs M2A cadastrados.", {
        description:
          "Complete Unidade Gestora, Órgão da Dotação e Unidade Orçamentária em /secretarias.",
      });
      return;
    }

    const requiredFields: Array<[keyof ProcessoM2AForm, string]> = [
      ["objeto", "Objeto"],
      ["data", "Data"],
      ["ano_orcamento", "Ano orcamentario"],
      ["orgao_solicitante", "Orgao solicitante"],
      ["unidade_orcamentaria", "Unidade orcamentaria"],
      ["responsavel_dfd", "Agente de planejamento"],
      ["classificacao", "Classificacao"],
    ];
    const missing = requiredFields.filter(
      ([field]) => !String(processoM2AForm[field] ?? "").trim(),
    );
    if (missing.length > 0) {
      notify.error("Preencha os dados do processo M2A.", {
        description: missing.map(([, label]) => label).join(","),
      });
      return;
    }
    setM2aConfirmOpen(true);
  }, [
    ensureConnected,
    processoM2AForm,
    rowsMissingM2A.length,
    selectedImportRows.length,
  ]);

  const buildM2AIrpPayload = useCallback(async () => {
    // Chave de participante = coluna da planilha (ref_coluna). Assim, mesmo quando
    // várias colunas caem na mesma UO (ex.: FUNDEB FF e FUNDEB FI), cada coluna
    // vira uma DFD independente — igual ao fluxo por dotação do contrato SRP.
    const chaveDaRow = (r: IrpImportRow): string => {
      const refColuna = r.resultado?.unidade.ref_coluna;
      return refColuna != null ? `col:${refColuna}` : `row:${r.key}`;
    };

    const uoGerenciadora =
      processoM2AForm.unidade_orcamentaria_gerenciadora.trim() ||
      processoM2AForm.unidade_orcamentaria.trim();
    const rowGerenciadora =
      selectedImportRows.find(
        (r) => enrichRowForM2A(r).uoId === uoGerenciadora,
      ) || selectedImportRows[0];
    if (!rowGerenciadora?.secretaria) {
      throw new Error("Secretaria gerenciadora não identificada.");
    }
    const gerenciadora_numero = rowGerenciadora.secretaria.numero;
    const gerenciadora_chave = chaveDaRow(rowGerenciadora);

    const secretariasParticipantes: M2ASrpPayload["secretariasParticipantes"] =
      selectedImportRows
        .filter((r) => r.secretaria)
        .map((r) => {
          const ids = enrichRowForM2A(r);
          const refColuna: number | null =
            r.resultado?.unidade.ref_coluna ?? null;
          const rotulo = r.cabecalhoColuna?.trim();
          return {
            chave: chaveDaRow(r),
            numero: r.secretaria!.numero,
            sigla: r.secretaria!.sigla,
            // nome inclui o rótulo da coluna quando existir, para distinguir
            // participantes que compartilham a mesma UO (ex.: "SEC EDU / FF").
            nome: rotulo
              ? `${r.secretaria!.nome} / ${rotulo}`
              : r.secretaria!.nome,
            m2a_orgao_id: ids.orgaoId,
            m2a_dot_orgao_id: r.secretaria!.m2a_dot_orgao_id,
            m2a_uo_id: ids.uoId,
            m2a_dot_id: r.secretaria!.m2a_dot_id,
            ref_coluna: refColuna,
          };
        });

    type ItemAgreg = M2ASrpPayload["itens"][number] & { _key: string };
    const map = new Map<string, ItemAgreg>();
    for (const row of selectedImportRows) {
      if (!row.resultado || !row.secretaria) continue;
      for (const it of row.resultado.itens) {
        const key = `${it.sourceRow}|${it.identificador || ""}|${it.descricao}`;
        let agg = map.get(key);
        if (!agg) {
          agg = {
            _key: key,
            descricao: it.descricao,
            especificacao: it.especificacao,
            natureza: it.natureza,
            unidade: it.unidade,
            valorReferencia: it.valorReferencia || 0,
            quantidades: {},
          };
          map.set(key, agg);
        }
        const chave = chaveDaRow(row);
        agg.quantidades[chave] =
          Number(agg.quantidades[chave] ?? 0) + it.quantidade;
      }
    }
    const itens = Array.from(map.values()).map(({ _key: _k, ...rest }) => rest);
    console.log("[irp-envio] participantes por coluna:", {
      totalParticipantes: secretariasParticipantes.length,
      totalLinhasSelecionadas: selectedImportRows.length,
      chaves: secretariasParticipantes.map((s) => ({
        chave: s.chave,
        nome: s.nome,
        m2a_uo_id: s.m2a_uo_id,
      })),
    });
    return {
      itens,
      secretariasParticipantes,
      gerenciadora_numero,
      gerenciadora_chave,
    };
  }, [enrichRowForM2A, processoM2AForm, selectedImportRows]);

  const confirmarCriacaoProcessoM2A = useCallback(async () => {
    const eSRP = processoM2AForm.e_registro_preco !== false;
    setBusy(true);
    const abortCtrl = new AbortController();
    startTask(
      eSRP ? "Criando processo SRP no M2A" : "Criando processo comum no M2A",
      "Preparando planilhas...",
      { onCancel: () => abortCtrl.abort() },
    );

    // Garante que qualquer listener anterior seja limpo antes de iniciar novo envio.
    m2aProcessOffRef.current?.();
    m2aProcessOffRef.current = null;

    try {
      const {
        itens,
        secretariasParticipantes,
        gerenciadora_numero,
        gerenciadora_chave,
      } = await buildM2AIrpPayload();

      const payloadBase = {
        objeto: processoM2AForm.objeto.trim(),
        data: processoM2AForm.data,
        ano_orcamento: processoM2AForm.ano_orcamento.trim(),
        orgao_solicitante: processoM2AForm.orgao_solicitante.trim(),
        unidade_orcamentaria: processoM2AForm.unidade_orcamentaria.trim(),
        unidade_orcamentaria_gerenciadora:
          processoM2AForm.unidade_orcamentaria_gerenciadora.trim() ||
          processoM2AForm.unidade_orcamentaria.trim(),
        responsavel_dfd: processoM2AForm.responsavel_dfd.trim(),
        comissao_planejamento:
          processoM2AForm.comissao_planejamento.trim() || "3911",
        classificacao: processoM2AForm.classificacao.trim(),
        gerenciadora_numero,
        gerenciadora_chave,
        itens,
        secretariasParticipantes,
      };
      const payload: M2ASrpPayload = {
        ...payloadBase,
        data_consolidacao:
          processoM2AForm.data_consolidacao || processoM2AForm.data,
      };
      const payloadComum: M2AComumPayload = payloadBase;

      setM2aConfirmOpen(false);
      if (jobId) {
        await supabase
          .from("irp_jobs")
          .update({
            m2a_envio_status: "em_andamento",
            m2a_envio_etapa: "iniciando",
            m2a_envio_mensagem: "Enviando ao M2A...",
            m2a_envio_started_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      async function handleM2AEvent(evt: any) {
        if (evt.type === "progress") {
          updateProgress(evt.progresso ?? 0, evt.mensagem, {
            etapa: evt.etapa,
          });
          if (jobId) {
            await supabase
              .from("irp_jobs")
              .update({
                m2a_envio_etapa: evt.etapa,
                m2a_envio_mensagem: evt.mensagem,
              })
              .eq("id", jobId);
          }
        } else if (evt.type === "cancelled") {
          if (jobId) {
            await supabase
              .from("irp_jobs")
              .update({
                m2a_envio_status: "cancelado",
                m2a_envio_mensagem: evt.mensagem ?? "Cancelado.",
                m2a_envio_completed_at: new Date().toISOString(),
              })
              .eq("id", jobId);
          }
          failTask(evt.mensagem ?? "Envio cancelado.");
          notify.warning("Envio cancelado", { description: evt.mensagem });
          setBusy(false);
        } else if (evt.type === "done") {
          if (jobId) {
            await supabase
              .from("irp_jobs")
              .update({
                m2a_processo_id: evt.processoId,
                m2a_envio_status: evt.erros.length
                  ? "concluido_com_erros"
                  : "concluido",
                m2a_envio_etapa: "concluido",
                m2a_envio_mensagem: evt.erros.length
                  ? `Concluído com ${evt.erros.length} erro(s)`
                  : "Processo SRP criado.",
                m2a_envio_completed_at: new Date().toISOString(),
              })
              .eq("id", jobId);
            await logAudit({
              action: "m2a_process_create",
              entityType: "irp_job",
              entityId: jobId,
              payload: {
                processoId: evt.processoId,
                dfdId: evt.dfdId,
                erros: evt.erros,
              },
            });
          }

          // Cria registro local em "processos" a partir da DFD enviada.
          let processoLocalId: string | null = null;
          try {
            const orgaoSel = processoM2AForm.orgao_solicitante.trim();
            const secretariaLocal = orgaoSel
              ? (secretariasM2A.find(
                  (s) =>
                    String(s.m2a_orgao_id ?? "") === orgaoSel ||
                    String(s.m2a_dot_orgao_id ?? "") === orgaoSel,
                ) ?? null)
              : null;
            const anoNum = Number.parseInt(processoM2AForm.ano_orcamento, 10);
            const { data: userData } = await supabase.auth.getUser();
            const { data: novoProc, error: procErr } = await supabase
              .from("processos")
              .insert({
                objeto:
                  processoM2AForm.objeto.trim() ||
                  `DFD ${evt.dfdId} (sem objeto)`,
                secretaria_id: secretariaLocal?.id ?? null,
                m2a_processo_id: evt.processoId,
                ano: Number.isFinite(anoNum) ? anoNum : null,
                data_abertura: processoM2AForm.data || null,
                status: "rascunho",
                modalidade: eSRP ? "SRP" : "comum",
                observacoes: `Criado automaticamente a partir do envio IRP/DFD ${evt.dfdId}.`,
                created_by: userData.user?.id ?? null,
              })
              .select("id")
              .single();
            if (procErr) throw procErr;
            processoLocalId = novoProc?.id ?? null;
            if (jobId && processoLocalId) {
              await supabase
                .from("irp_jobs")
                .update({ processo_id: processoLocalId } as any)
                .eq("id", jobId);
            }
          } catch (err: any) {
            console.error("[irp] falha ao criar processo local", err);
            notify.warning(
              "Processo M2A criado, mas o registro local falhou",
              {
                description:
                  err?.message ??
                  "Crie manualmente em Processos se necessário.",
              },
            );
          }

          const tituloOk = eSRP ? "Processo SRP" : "Processo comum";
          finishTask(`${tituloOk} ${evt.processoId} criado.`);
          const okCount = eSRP
            ? `${(evt.totalPlanilhas ?? 0) - (evt.erros?.length ?? 0)}/${evt.totalPlanilhas ?? 0} planilhas OK`
            : `${evt.totalDfds ?? 0} DFD(s) criadas · ${evt.erros?.length ?? 0} aviso(s)`;
          notify.success(`${tituloOk} criado no M2A`, {
            description: `Processo ${evt.processoId} · ${okCount}${processoLocalId ? " · registro local criado" : ""}`,
          });
          setBusy(false);
        } else if (evt.type === "error") {
          if (jobId) {
            await supabase
              .from("irp_jobs")
              .update({
                m2a_envio_status: "erro",
                m2a_envio_mensagem: evt.error,
                m2a_envio_completed_at: new Date().toISOString(),
              })
              .eq("id", jobId);
          }
          failTask(evt.error);
          notify.error("Falha ao criar processo M2A", {
            description: evt.error,
          });
          setBusy(false);
        }
      }

      const runner: Promise<void> = eSRP
        ? criarProcessoSrpM2A(payload, handleM2AEvent, abortCtrl.signal)
        : criarProcessoComumM2A(
            payloadComum,
            handleM2AEvent as any,
            abortCtrl.signal,
          );

      // Registra cleanup: aborta em caso de unmount.
      m2aProcessOffRef.current = () => abortCtrl.abort();

      await runner;

      // Envio concluído: libera o ref.
      m2aProcessOffRef.current = null;
    } catch (e: any) {
      failTask(e?.message ?? "Falha ao iniciar criacao do processo M2A.");
      notify.error("Falha ao iniciar processo M2A", {
        description: e?.message,
      });
      setBusy(false);
      m2aProcessOffRef.current = null;
    }
  }, [
    buildM2AIrpPayload,
    failTask,
    finishTask,
    jobId,
    processoM2AForm,
    secretariasM2A,
    startTask,
    updateProgress,
  ]);

  return {
    busy,
    m2aConfirmOpen,
    setM2aConfirmOpen,
    abrirConfirmacaoProcessoM2A,
    confirmarCriacaoProcessoM2A,
  };
}
