import { useCallback, useState } from "react";
import {
  fetchSaldosAta,
  garantirParticipantesAta,
  type AtaItemSaldo,
  type GarantirParticipanteResult,
} from "@/lib/m2a/atas";
import type { ContratoPreliminar } from "@/lib/contratoImport";
import type { SecretariaM2A } from "../lib";
import { resolveSecretariaForContrato } from "../lib";

export type SaldoIssue = {
  contratoKey: string;
  contratoLabel: string;
  m2aItemId: string;
  numero: string | null;
  descricao: string;
  quantidadeSolicitada: number;
  saldoDisponivel: number | null;
  totalDotacoes: number;
  acao: "ajustar_para_saldo" | "bloquear_manual" | "bloquear_sem_saldo" | "sem_verificacao";
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

/**
 * Executa as validações pré-geração:
 *   1. Consulta saldo real (M2A) de cada ata envolvida.
 *   2. Garante que as secretarias envolvidas estão incluídas em cada ata.
 * Prepostos não entram aqui — já são validados sincronamente no painel.
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

  const validar = useCallback(async () => {
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

      // Conta quantos "slots" (contratos) diferentes usam cada m2a_item_id.
      // Se >1, significa que o item foi rateado entre secretarias/dotações
      // diferentes → bloqueio manual quando o total excede o saldo.
      const usoPorItem = new Map<string, number>();
      for (const c of contratosSelecionados) {
        const vistos = new Set<string>();
        for (const it of c.itens) {
          if (!it.m2aItemId || vistos.has(it.m2aItemId)) continue;
          vistos.add(it.m2aItemId);
          usoPorItem.set(it.m2aItemId, (usoPorItem.get(it.m2aItemId) ?? 0) + 1);
        }
      }

      // 1) Saldos por ata.
      const saldos: ValidacaoPreGeracao["saldos"] = {
        ok: 0,
        ajustados: [],
        bloqueados: [],
        naoVerificados: [],
      };
      const novosAjustes = new Map<string, number>();

      await Promise.all(
        Array.from(atas.entries()).map(async ([ataId, contratos]) => {
          let itens: AtaItemSaldo[] = [];
          try {
            const r = await fetchSaldosAta(ataId);
            itens = r.itens;
          } catch {
            /* trata como sem verificação */
          }
          const saldoMap = new Map(itens.map((i) => [i.m2a_item_id, i]));

          for (const c of contratos) {
            const label =
              `${c.empresa} · ${c.secretariaSigla}` || "(contrato)";
            for (const item of c.itens) {
              const m2aId = item.m2aItemId ?? undefined;
              const qtd = Number(item.quantidade ?? 0);
              const totalDotacoes = m2aId ? usoPorItem.get(m2aId) ?? 1 : 1;
              if (!m2aId) {
                saldos.naoVerificados.push({
                  contratoKey: c.key,
                  contratoLabel: label,
                  m2aItemId: "",
                  numero: item.numeroItem ?? null,
                  descricao: item.descricao ?? "",
                  quantidadeSolicitada: qtd,
                  saldoDisponivel: null,
                  totalDotacoes,
                  acao: "sem_verificacao",
                });
                continue;
              }
              const s = saldoMap.get(m2aId);
              const saldoDisp = s?.saldo ?? null;
              const base: Omit<SaldoIssue, "acao"> = {
                contratoKey: c.key,
                contratoLabel: label,
                m2aItemId: m2aId,
                numero: s?.numero ?? item.numeroItem ?? null,
                descricao: s?.descricao || item.descricao || "",
                quantidadeSolicitada: qtd,
                saldoDisponivel: saldoDisp,
                totalDotacoes,
              };
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
              novosAjustes.set(`${c.key}::${m2aId}`, saldoDisp);
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
  }, [contratosSelecionados, secretariasM2A, dataBatch]);

  const reset = useCallback(() => {
    setResult(null);
    setAjustesAplicaveis(new Map());
  }, []);

  return { busy, result, ajustesAplicaveis, validar, reset };
}
