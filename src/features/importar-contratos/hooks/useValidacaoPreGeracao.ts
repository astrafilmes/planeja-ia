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

export type SaldoIssue = {
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
  };
  participantes: {
    porAta: Record<string, GarantirParticipanteResult[]>;
    bloqueadas: GarantirParticipanteResult[];
  };
  hasBlockers: boolean;
};

function normSecKey(txt: string) {
  return (normalizeText(txt) || "").toUpperCase();
}

function buildSecretariaSaldoIndex(
  resp: SaldosPorSecretariaResponse,
): Map<string, Map<string, { cota: number | null; consumido: number; saldo: number | null; descricao: string }>> {
  const map = new Map<
    string,
    Map<string, { cota: number | null; consumido: number; saldo: number | null; descricao: string }>
  >();
  for (const s of resp.secretarias) {
    const inner = new Map<
      string,
      { cota: number | null; consumido: number; saldo: number | null; descricao: string }
    >();
    for (const it of s.itens) {
      if (!it.numero) continue;
      inner.set(String(it.numero), {
        cota: it.cota,
        consumido: it.consumido,
        saldo: it.saldo,
        descricao: it.descricao,
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
}) {
  const { contratosSelecionados, secretariasM2A, dataBatch } = options;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidacaoPreGeracao | null>(null);
  const [ajustesAplicaveis, setAjustesAplicaveis] = useState<Map<string, number>>(
    new Map(),
  );

  const validar = useCallback(
    async (opts: { forceRefresh?: boolean } = {}) => {
      setBusy(true);
      try {
        // Agrupa por ata.
        const atas = new Map<string, ContratoPreliminar[]>();
        for (const c of contratosSelecionados) {
          if (!c.m2aAtaId) continue;
          const list = atas.get(c.m2aAtaId) ?? [];
          list.push(c);
          atas.set(c.m2aAtaId, list);
        }

        // Conta "slots" (contratos) diferentes usando cada m2a_item_id/numero.
        const usoPorItem = new Map<string, number>();
        for (const c of contratosSelecionados) {
          const vistos = new Set<string>();
          for (const it of c.itens) {
            const key = it.m2aItemId ?? it.numeroItem ?? null;
            if (!key || vistos.has(String(key))) continue;
            vistos.add(String(key));
            usoPorItem.set(String(key), (usoPorItem.get(String(key)) ?? 0) + 1);
          }
        }

        // 1) Saldos por ata (cota − consumo).
        const saldos: ValidacaoPreGeracao["saldos"] = {
          ok: 0,
          ajustados: [],
          bloqueados: [],
          naoVerificados: [],
        };
        const novosAjustes = new Map<string, number>();

        await Promise.all(
          Array.from(atas.entries()).map(async ([ataId, contratos]) => {
            let resp: SaldosPorSecretariaResponse | null = null;
            try {
              resp = await fetchSaldosPorSecretariaAta(ataId, {
                forceRefresh: opts.forceRefresh,
              });
            } catch {
              /* trata como sem verificação */
            }
            const idx = resp ? buildSecretariaSaldoIndex(resp) : null;

            for (const c of contratos) {
              const label = `${c.empresa} · ${c.secretariaSigla}` || "(contrato)";
              const secResolved = resolveSecretariaForContrato(c, secretariasM2A);
              const secKey = normSecKey(secResolved?.nome || c.secretariaSigla || "");
              const inner = idx?.get(secKey) ?? null;

              for (const item of c.itens) {
                const numero = item.numeroItem ? String(item.numeroItem) : null;
                const m2aId = item.m2aItemId ?? "";
                const qtd = Number(item.quantidade ?? 0);
                const usoKey = m2aId || numero || "";
                const totalDotacoes = usoKey ? usoPorItem.get(usoKey) ?? 1 : 1;

                const base: Omit<SaldoIssue, "acao"> = {
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

        // 2) Participantes (secretarias) por ata.
        const porAta: Record<string, GarantirParticipanteResult[]> = {};
        const bloqueadas: GarantirParticipanteResult[] = [];

        await Promise.all(
          Array.from(atas.entries()).map(async ([ataId, contratos]) => {
            const alvos = new Map<
              string,
              { secretariaId: string; nome: string; unidadeGestoraId?: string | number }
            >();
            for (const c of contratos) {
              const sec = resolveSecretariaForContrato(c, secretariasM2A);
              if (!sec) continue;
              if (alvos.has(sec.id)) continue;
              alvos.set(sec.id, {
                secretariaId: sec.id,
                nome: sec.nome,
                unidadeGestoraId: sec.m2a_uo_id ?? undefined,
              });
            }
            if (alvos.size === 0) return;
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
                  bloqueadas.push(item);
                }
              }
            } catch (err) {
              porAta[ataId] = [
                {
                  secretariaId: "",
                  nome: `(falha ao consultar ata ${ataId})`,
                  status: "erro",
                  mensagem: err instanceof Error ? err.message : String(err),
                },
              ];
              bloqueadas.push(porAta[ataId][0]);
            }
          }),
        );

        const hasBlockers = saldos.bloqueados.length > 0 || bloqueadas.length > 0;
        const finalResult: ValidacaoPreGeracao = {
          saldos,
          participantes: { porAta, bloqueadas },
          hasBlockers,
        };
        setResult(finalResult);
        setAjustesAplicaveis(novosAjustes);
        return finalResult;
      } finally {
        setBusy(false);
      }
    },
    [contratosSelecionados, secretariasM2A, dataBatch],
  );

  const reset = useCallback(() => {
    setResult(null);
    setAjustesAplicaveis(new Map());
  }, []);

  return { busy, result, ajustesAplicaveis, validar, reset };
}
