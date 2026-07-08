import { useCallback, useState } from "react";
import {
  fetchSaldosPorSecretariaAta,
  garantirParticipantesAta,
  type GarantirParticipanteResult,
  type SaldosPorSecretariaResponse,
} from "@/lib/m2a/atas";
import type { ContratoPreliminar } from "@/lib/contratoImport";
import type { SecretariaM2A } from "../lib";
import { resolveSecretariaForContrato } from "../lib";
import { normSec } from "@/lib/m2a/normSec";
import { getOrgaoMapping } from "@/lib/m2a/orgaos-mapping";
import { notify } from "@/lib/notify";

export type ValidacaoProgress = {
  phase: "saldos" | "participantes" | "idle";
  totalAtas: number;
  saldosDone: number;
  participantesDone: number;
};

export type SaldoIssue = {
  ataId: string;
  ataNumero: string | null;
  contratosConsumidores?: Array<{
    contratoId: number | string;
    numeroContrato?: string | null;
    processoId?: string | null;
    processoNumero?: string | null;
    quantidade?: number | null;
  }>;
  contratoKey: string;
  contratoLabel: string;
  m2aItemId: string;
  numero: string | null;
  descricao: string;
  quantidadeSolicitada: number;
  cota: number | null;
  consumido: number | null;
  saldoDisponivel: number | null;
  totalDotacoes: number;
  acao:
    | "ajustar_para_saldo"
    | "bloquear_manual"
    | "bloquear_sem_saldo"
    | "sem_verificacao";
};

export type ValidacaoPreGeracao = {
  saldos: {
    ok: number;
    ajustados: SaldoIssue[];
    bloqueados: SaldoIssue[];
    naoVerificados: SaldoIssue[];
    avisos: Array<{
      ataId: string;
      ataNumero: string | null;
      mensagem: string;
      contratoId?: number | string;
      numeroContrato?: string | null;
    }>;
  };
  participantes: {
    porAta: Record<string, GarantirParticipanteResult[]>;
    bloqueadas: Array<GarantirParticipanteResult & { ataId: string; ataNumero: string | null }>;
  };
  hasBlockers: boolean;

};

function normSecKey(txt: string) {
  return normSec(txt);
}

function buildSecretariaSaldoIndex(
  resp: SaldosPorSecretariaResponse,
): Map<string, Map<string, { cota: number | null; consumido: number; saldo: number | null; descricao: string; contratosConsumidores?: SaldoIssue["contratosConsumidores"] }>> {
  const map = new Map<
    string,
    Map<string, { cota: number | null; consumido: number; saldo: number | null; descricao: string; contratosConsumidores?: SaldoIssue["contratosConsumidores"] }>
  >();
  for (const s of resp.secretarias) {
    const inner = new Map<
      string,
      { cota: number | null; consumido: number; saldo: number | null; descricao: string; contratosConsumidores?: SaldoIssue["contratosConsumidores"] }
    >();
    for (const it of s.itens) {
      if (!it.numero) continue;
      inner.set(String(it.numero), {
        cota: it.cota,
        consumido: it.consumido,
        saldo: it.saldo,
        descricao: it.descricao,
        contratosConsumidores:
          it.contratosConsumidores ??
          resp.consumoDebug?.contratosPorSecretariaItem?.[s.secretariaKey]?.[String(it.numero)] ??
          [],
      });
    }
    map.set(s.secretariaKey, inner);
  }
  return map;
}

/**
 * Executa as validações pré-geração:
 *   1. Calcula saldo real por (ata, secretaria, item) = cota − consumo.
 *   2. Garante que as secretarias envolvidas estão incluídas em cada ata.
 * Prepostos não entram aqui — são validados sincronamente no painel.
 */
export function useValidacaoPreGeracao(options: {
  contratosSelecionados: ContratoPreliminar[];
  secretariasM2A: SecretariaM2A[];
  dataBatch: string;
  m2aProcessoId?: string | null;
}) {
  const { contratosSelecionados, secretariasM2A, dataBatch, m2aProcessoId } = options;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidacaoPreGeracao | null>(null);
  const [ajustesAplicaveis, setAjustesAplicaveis] = useState<Map<string, number>>(
    new Map(),
  );

  const [progress, setProgress] = useState<ValidacaoProgress>({
    phase: "idle",
    totalAtas: 0,
    saldosDone: 0,
    participantesDone: 0,
  });

  const validar = useCallback(
    async (opts: { forceRefresh?: boolean } = {}) => {
      setBusy(true);
      const toastId = notify.loading("Validando saldos e participantes no M2A...");
      try {
        // Agrupa por ata.
        const atas = new Map<string, ContratoPreliminar[]>();
        for (const c of contratosSelecionados) {
          if (!c.m2aAtaId) continue;
          const list = atas.get(c.m2aAtaId) ?? [];
          list.push(c);
          atas.set(c.m2aAtaId, list);
        }

        // Conta "slots" (contratos) por (ataId, item). Escopo por ata evita
        // colisão entre atas diferentes com mesmo numero_item.
        const usoPorItem = new Map<string, number>();
        for (const c of contratosSelecionados) {
          const ataId = c.m2aAtaId ?? "sem-ata";
          const vistos = new Set<string>();
          for (const it of c.itens) {
            const rawKey = it.m2aItemId ?? it.numeroItem ?? null;
            if (!rawKey) continue;
            const key = `${ataId}::${rawKey}`;
            if (vistos.has(key)) continue;
            vistos.add(key);
            usoPorItem.set(key, (usoPorItem.get(key) ?? 0) + 1);
          }
        }

        const totalAtas = atas.size;
        setProgress({ phase: "saldos", totalAtas, saldosDone: 0, participantesDone: 0 });
        notify.dismiss(toastId);
        const saldosToast = notify.loading(
          `Consultando saldos das atas... (0/${totalAtas})`,
        );

        // 1) Saldos por ata (cota − consumo).
        const saldos: ValidacaoPreGeracao["saldos"] = {
          ok: 0,
          ajustados: [],
          bloqueados: [],
          naoVerificados: [],
          avisos: [],
        };
        const novosAjustes = new Map<string, number>();
        let saldosDone = 0;

        await Promise.all(
          Array.from(atas.entries()).map(async ([ataId, contratos]) => {
            let resp: SaldosPorSecretariaResponse | null = null;
            try {
              resp = await fetchSaldosPorSecretariaAta(ataId, {
                forceRefresh: opts.forceRefresh,
                m2aProcessoId,
              });
            } catch {
              /* trata como sem verificação */
            }
            const idx = resp ? buildSecretariaSaldoIndex(resp) : null;
            const ataNumero = contratos.find((c) => c.m2aAtaNumero)?.m2aAtaNumero ?? null;
            for (const aviso of resp?.avisos ?? []) {
              if (typeof aviso === "string") {
                saldos.avisos.push({ ataId, ataNumero, mensagem: aviso });
              } else {
                saldos.avisos.push({
                  ataId,
                  ataNumero,
                  mensagem: aviso.mensagem,
                  contratoId: aviso.contratoId,
                  numeroContrato: aviso.numeroContrato,
                });
              }
            }
            saldosDone += 1;
            setProgress((p) => ({ ...p, saldosDone }));
            notify.loading(
              `Consultando saldos das atas... (${saldosDone}/${totalAtas})`,
              { id: saldosToast },
            );

            for (const c of contratos) {
              const ataNumero = c.m2aAtaNumero ?? null;
              const label =
                [c.empresa, c.secretariaSigla].filter(Boolean).join(" · ") ||
                "(contrato)";
              const secResolved = resolveSecretariaForContrato(c, secretariasM2A);
              const secKey = normSecKey(secResolved?.nome || c.secretariaSigla || "");
              const inner = idx?.get(secKey) ?? null;

              for (const item of c.itens) {
                const numero = item.numeroItem ? String(item.numeroItem) : null;
                const m2aId = item.m2aItemId ?? "";
                const qtd = Number(item.quantidade ?? 0);
                const usoKey =
                  (m2aId || numero) ? `${ataId}::${m2aId || numero}` : "";
                const totalDotacoes = usoKey ? usoPorItem.get(usoKey) ?? 1 : 1;

                const base: Omit<SaldoIssue, "acao"> = {
                  ataId,
                  ataNumero,
                  contratosConsumidores: [],
                  contratoKey: c.key,
                  contratoLabel: label,
                  m2aItemId: m2aId,
                  numero,
                  descricao: item.descricao ?? "",
                  quantidadeSolicitada: qtd,
                  cota: null,
                  consumido: null,
                  saldoDisponivel: null,
                  totalDotacoes,
                };

                if (!inner || !numero) {
                  saldos.naoVerificados.push({ ...base, acao: "sem_verificacao" });
                  continue;
                }
                const hit = inner.get(numero);
                if (!hit) {
                  saldos.naoVerificados.push({ ...base, acao: "sem_verificacao" });
                  continue;
                }
                base.cota = hit.cota;
                base.consumido = hit.consumido;
                base.saldoDisponivel = hit.saldo;
                base.descricao = hit.descricao || base.descricao;
                base.contratosConsumidores = hit.contratosConsumidores ?? [];

                const saldoDisp = hit.saldo;
                if (saldoDisp == null) {
                  saldos.naoVerificados.push({ ...base, acao: "sem_verificacao" });
                  continue;
                }
                if (qtd <= saldoDisp) {
                  saldos.ok += 1;
                  continue;
                }
                if (saldoDisp <= 0) {
                  saldos.bloqueados.push({ ...base, acao: "bloquear_sem_saldo" });
                  continue;
                }
                if (totalDotacoes > 1) {
                  saldos.bloqueados.push({ ...base, acao: "bloquear_manual" });
                  continue;
                }
                saldos.ajustados.push({ ...base, acao: "ajustar_para_saldo" });
                if (m2aId) {
                  novosAjustes.set(`${c.key}::${m2aId}`, saldoDisp);
                } else if (numero) {
                  novosAjustes.set(`${c.key}::num::${numero}`, saldoDisp);
                }
              }
            }
          }),
        );

        notify.dismiss(saldosToast);
        setProgress((p) => ({ ...p, phase: "participantes" }));
        const partToast = notify.loading(
          `Verificando participantes das atas... (0/${totalAtas})`,
        );
        let participantesDone = 0;

        // 2) Participantes (secretarias) por ata.
        const porAta: Record<string, GarantirParticipanteResult[]> = {};
        const bloqueadas: Array<
          GarantirParticipanteResult & { ataId: string; ataNumero: string | null }
        > = [];

        await Promise.all(
          Array.from(atas.entries()).map(async ([ataId, contratos]) => {
            const ataNumero =
              contratos.find((c) => c.m2aAtaNumero)?.m2aAtaNumero ?? null;
            const alvos = new Map<
              string,
              { secretariaId: string; nome: string; unidadeGestoraId?: string | number }
            >();
            for (const c of contratos) {
              const sec = resolveSecretariaForContrato(c, secretariasM2A);
              if (!sec) continue;
              // Use o NOME DO ÓRGÃO PAI (secretaria responsável) — é o que aparece
              // como participante da ata no M2A. A UO/dotação local (ex.: "HOSPITAL
              // MUNICIPAL") não existe como participante — o participante é sempre
              // a secretaria (ex.: "SECRETARIA MUNICIPAL DE SAÚDE").
              const orgao = getOrgaoMapping(sec.m2a_orgao_id);
              const nomeParticipante = orgao?.nome ?? sec.nome;
              // Dedup por órgão M2A (evita tentar incluir 3x a mesma secretaria
              // quando o processo mistura contratos de UOs diferentes do mesmo órgão).
              const dedupKey = sec.m2a_orgao_id ?? sec.id;
              if (alvos.has(dedupKey)) continue;
              alvos.set(dedupKey, {
                secretariaId: sec.id,
                nome: nomeParticipante,
                unidadeGestoraId: sec.m2a_orgao_id ?? undefined,
              });
            }
            if (alvos.size === 0) {
              participantesDone += 1;
              setProgress((p) => ({ ...p, participantesDone }));
              notify.loading(
                `Verificando participantes das atas... (${participantesDone}/${totalAtas})`,
                { id: partToast },
              );
              return;
            }
            try {
              const r = await garantirParticipantesAta(ataId, {
                data: dataBatch,
                alvos: Array.from(alvos.values()),
              });
              porAta[ataId] = r.results;
              for (const item of r.results) {
                if (
                  item.status === "sem_equivalencia" ||
                  item.status === "sem_participante_na_ata" ||
                  item.status === "erro"
                ) {
                  bloqueadas.push({ ...item, ataId, ataNumero });
                }
              }
            } catch (err) {
              const fail: GarantirParticipanteResult = {
                secretariaId: "",
                nome: `(falha ao consultar ata ${ataNumero ?? ataId})`,
                status: "erro",
                mensagem: err instanceof Error ? err.message : String(err),
              };
              porAta[ataId] = [fail];
              bloqueadas.push({ ...fail, ataId, ataNumero });
            }
            participantesDone += 1;
            setProgress((p) => ({ ...p, participantesDone }));
            notify.loading(
              `Verificando participantes das atas... (${participantesDone}/${totalAtas})`,
              { id: partToast },
            );
          }),
        );

        notify.dismiss(partToast);


        const hasBlockers = saldos.bloqueados.length > 0 || bloqueadas.length > 0;
        const finalResult: ValidacaoPreGeracao = {
          saldos,
          participantes: { porAta, bloqueadas },
          hasBlockers,
        };
        setResult(finalResult);
        setAjustesAplicaveis(novosAjustes);
        if (hasBlockers) {
          notify.warning(
            `Validação concluída com ${saldos.bloqueados.length + bloqueadas.length} bloqueio(s).`,
          );
        } else {
          notify.success("Validação concluída — pronto para gerar.");
        }
        return finalResult;
      } catch (err) {
        notify.dismiss(toastId);
        notify.error(err instanceof Error ? err.message : "Falha ao validar");
        throw err;
      } finally {
        setBusy(false);
        setProgress({ phase: "idle", totalAtas: 0, saldosDone: 0, participantesDone: 0 });
      }
    },
    [contratosSelecionados, secretariasM2A, dataBatch, m2aProcessoId],
  );

  const reset = useCallback(() => {
    setResult(null);
    setAjustesAplicaveis(new Map());
  }, []);

  return { busy, result, progress, ajustesAplicaveis, validar, reset };
}
