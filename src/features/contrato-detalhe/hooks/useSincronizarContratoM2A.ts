import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import type { ContratoFull, ItemRow } from "../lib";

interface M2aItem {
  contratoItemId: number | string | null;
  numero: string | null;
  descricao: string | null;
  quantidadeContratada: number | null;
}

interface SincronizarResponse {
  ok: boolean;
  m2a_contrato_id: string;
  itens: M2aItem[];
  documentos: Array<{ id: string; nome: string }>;
  error?: string;
}

function normalizeNumero(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/^0+/, "").toLowerCase();
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function useSincronizarContratoM2A(
  contrato: ContratoFull | null | undefined,
  onDone: () => void,
) {
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async () => {
    if (!contrato) return;
    const c = contrato.contrato;
    const m2aContratoId = c.m2a_contrato_id;
    if (!m2aContratoId) {
      notify.error(
        "Este contrato ainda não foi enviado à M2A — não há ID para sincronizar.",
      );
      return;
    }

    setSincronizando(true);
    
    // Verificar se precisa sincronizar itens/documentos
    const { count: docsPendentes } = await supabase
      .from("contrato_documentos")
      .select("*", { count: "exact", head: true })
      .eq("contrato_id", c.id)
      .is("m2a_documento_id", null);

    if (docsPendentes === 0) {
      // Opcional: poderíamos verificar itens também, mas o usuário pediu especificamente sobre documentos
      // notify.success("Este contrato já possui todos os documentos vinculados.");
      // setSincronizando(false);
      // return;
    }

    const toastId = notify.loading("Consultando dados na M2A…");
    try {
      const { data, error } = await supabase.functions.invoke<SincronizarResponse>(
        "m2a-proxy",
        {
          body: {
            path: "/contratos/sincronizar",
            method: "POST",
            body: { m2a_contrato_id: String(m2aContratoId) },
          },
        },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha ao consultar M2A.");

      const remoteItens = data.itens ?? [];
      const usados = new Set<string>();
      const findRemote = (item: ItemRow): M2aItem | null => {
        // 1) match por m2a_item_id
        if (item.m2a_item_id) {
          const byId = remoteItens.find(
            (r) =>
              String(r.contratoItemId ?? "") === String(item.m2a_item_id) &&
              !usados.has(String(r.contratoItemId)),
          );
          if (byId) return byId;
        }
        // 2) match por numero_item
        const numLocal = normalizeNumero(item.numero_item);
        if (numLocal) {
          const byNum = remoteItens.find(
            (r) =>
              normalizeNumero(r.numero) === numLocal &&
              !usados.has(String(r.contratoItemId)),
          );
          if (byNum) return byNum;
        }
        return null;
      };

      let atualizados = 0;
      let semMatch = 0;
      let semMudanca = 0;
      const updates: Array<{
        id: string;
        quantidade: number;
        valor_total: number;
        m2a_item_id: string | null;
      }> = [];

      for (const item of contrato.itens) {
        const remote = findRemote(item);
        if (!remote) {
          semMatch += 1;
          continue;
        }
        usados.add(String(remote.contratoItemId));
        const novaQtd = remote.quantidadeContratada ?? 0;
        const qtdAtual = toNumber(item.quantidade);
        const valorUnit = toNumber(item.valor_unitario);
        const novoTotal = novaQtd * valorUnit;
        const totalAtual = toNumber(item.valor_total);
        const m2aIdRemoto = remote.contratoItemId
          ? String(remote.contratoItemId)
          : null;
        const precisaAtualizarId =
          m2aIdRemoto && m2aIdRemoto !== (item.m2a_item_id ?? null);
        if (
          Math.abs(novaQtd - qtdAtual) < 0.0000001 &&
          Math.abs(novoTotal - totalAtual) < 0.005 &&
          !precisaAtualizarId
        ) {
          semMudanca += 1;
          continue;
        }
        updates.push({
          id: item.id,
          quantidade: novaQtd,
          valor_total: novoTotal,
          m2a_item_id: m2aIdRemoto ?? item.m2a_item_id ?? null,
        });
      }

      for (const u of updates) {
        const { error: upErr } = await supabase
          .from("contrato_itens")
          .update({
            quantidade: u.quantidade,
            valor_total: u.valor_total,
            m2a_item_id: u.m2a_item_id,
          })
          .eq("id", u.id);
        if (upErr) throw upErr;
        atualizados += 1;
      }

      const partes = [
        `${atualizados} item(ns) atualizado(s)`,
        `${semMudanca} sem mudança`,
      ];
      if (semMatch > 0) partes.push(`${semMatch} sem correspondência na M2A`);
      // Sincronização de documentos (Portal links)
      const documentosRemotos = data.documentos ?? [];
      if (documentosRemotos.length > 0) {
        const { data: docsLocais } = await supabase
          .from("contrato_documentos")
          .select("id, m2a_documento_id, nome")
          .eq("contrato_id", c.id);

        if (docsLocais) {
          const updates = [];
          for (const docRemote of documentosRemotos) {
            const nomeNormRemoto = docRemote.nome.toUpperCase().trim();
            
            // Busca um documento local que tenha nome similar e ainda não tenha o ID vinculado
            const matchLocal = docsLocais.find(d => {
              if (d.m2a_documento_id === docRemote.id) return false;
              const nomeNormLocal = String(d.nome || "").toUpperCase().trim();
              
              // Match exato ou por prefixo (ex: "CONTRATO" bate com "CONTRATO - 14.133")
              return nomeNormLocal.includes(nomeNormRemoto) || nomeNormRemoto.includes(nomeNormLocal);
            });

            if (matchLocal) {
              updates.push(
                supabase
                  .from("contrato_documentos")
                  .update({ m2a_documento_id: docRemote.id })
                  .eq("id", matchLocal.id)
              );
            }
          }
          if (updates.length > 0) {
            await Promise.all(updates);
            partes.push(`${updates.length} link(s) de documento vinculados`);
          }
        }
      }

      notify.success(`Sincronização concluída: ${partes.join(" · ")}.`, {
        id: toastId,
      });
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error(`Falha ao sincronizar com a M2A: ${msg}`, { id: toastId });
    } finally {
      setSincronizando(false);
    }
  }, [contrato, onDone]);

  return { sincronizar, sincronizando };
}
