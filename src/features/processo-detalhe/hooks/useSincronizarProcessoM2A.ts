import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import type { ContratoRow } from "../lib";

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

export function useSincronizarProcessoM2A(
  processoId: string,
  contratos: ContratoRow[],
) {
  const qc = useQueryClient();
  const [sincronizando, setSincronizando] = useState(false);
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const sincronizar = useCallback(async () => {
    // Busca os contratos novamente para garantir que temos os dados de documentos
    const { data: dbContratos } = await supabase
      .from("contratos")
      .select("id, numero_contrato, m2a_contrato_id, m2a_documentos_gerados")
      .eq("processo_id", processoId)
      .not("m2a_contrato_id", "is", null);

    if (!dbContratos || dbContratos.length === 0) {
      notify.error(
        "Nenhum contrato deste processo foi enviado à M2A ainda.",
      );
      return;
    }

    // Filtra contratos que não têm a lista de documentos preenchida ou está vazia
    const contratosParaSinc = dbContratos.filter(c => {
      const docs = c.m2a_documentos_gerados as any[];
      return !docs || docs.length === 0;
    });

    if (contratosParaSinc.length === 0) {
      const resetConfirm = window.confirm("Todos os contratos já parecem ter documentos sincronizados. Deseja forçar uma nova sincronização geral?");
      if (!resetConfirm) return;
      contratosParaSinc.push(...dbContratos);
    }

    setSincronizando(true);
    startTask(
      "Sincronizando Processo",
      `Sincronizando ${contratosParaSinc.length} contrato(s) que possuem documentos pendentes...`,
    );

    let sucessos = 0;
    let falhas = 0;
    let totalItensAtualizados = 0;
    let totalDocsVinculados = 0;

    try {
      for (let i = 0; i < contratosParaSinc.length; i++) {
        const c = contratosParaSinc[i];
        const progresso = (i / contratosParaSinc.length) * 100;
        updateProgress(
          progresso,
          `Sincronizando contrato ${c.numero_contrato} (${i + 1}/${contratosParaSinc.length})...`,
        );

        try {
          const { data, error } = await supabase.functions.invoke<SincronizarResponse>(
            "m2a-proxy",
            {
              body: {
                path: "/contratos/sincronizar",
                method: "POST",
                body: { m2a_contrato_id: String(c.m2a_contrato_id) },
              },
            },
          );

          if (error) throw new Error(error.message);
          if (!data?.ok) throw new Error(data?.error || "Falha ao consultar M2A.");

          const remoteItens = data.itens ?? [];
          const usados = new Set<string>();
          
          const findRemote = (item: any): M2aItem | null => {
            if (item.m2a_item_id) {
              const byId = remoteItens.find(
                (r) =>
                  String(r.contratoItemId ?? "") === String(item.m2a_item_id) &&
                  !usados.has(String(r.contratoItemId)),
              );
              if (byId) return byId;
            }
            const numLocal = normalizeNumero(item.numero_item || item.numero);
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

          // 1. Sincronizar Itens
          const { data: dbItens } = await supabase
            .from("contrato_itens")
            .select("id, m2a_item_id, numero_item, quantidade, valor_unitario, valor_total")
            .eq("contrato_id", c.id);

          if (dbItens) {
            for (const item of dbItens) {
              const remote = findRemote(item);
              if (!remote) continue;
              
              usados.add(String(remote.contratoItemId));
              const novaQtd = remote.quantidadeContratada ?? 0;
              const qtdAtual = toNumber(item.quantidade);
              const valorUnit = toNumber(item.valor_unitario);
              const novoTotal = novaQtd * valorUnit;
              const totalAtual = toNumber(item.valor_total);
              const m2aIdRemoto = remote.contratoItemId ? String(remote.contratoItemId) : null;
              
              const precisaAtualizar = 
                Math.abs(novaQtd - qtdAtual) > 0.0000001 || 
                Math.abs(novoTotal - totalAtual) > 0.005 ||
                (m2aIdRemoto && m2aIdRemoto !== (item.m2a_item_id ?? null));

              if (precisaAtualizar) {
                const { error: upErr } = await supabase
                  .from("contrato_itens")
                  .update({
                    quantidade: novaQtd,
                    valor_total: novoTotal,
                    m2a_item_id: m2aIdRemoto ?? item.m2a_item_id ?? null,
                  })
                  .eq("id", item.id);
                
                if (!upErr) totalItensAtualizados++;
                else console.error("Erro ao atualizar item:", upErr);
              }
            }
          }

          // 2. Sincronizar Documentos
          const documentosRemotos = data.documentos ?? [];
          if (documentosRemotos.length > 0) {
            const { data: docsLocais } = await supabase
              .from("contrato_documentos")
              .select("id, m2a_documento_id, nome")
              .eq("contrato_id", c.id);

            const docUpdates = [];
            
            // Criamos um mapa dos documentos remotos por nome para facilitar o vínculo
            const remotosRestantes = [...documentosRemotos];

            // 2.1 Tentar vincular docs que já existem localmente (mesmo nome)
            if (docsLocais && docsLocais.length > 0) {
              for (const docLocal of docsLocais) {
                if (docLocal.m2a_documento_id) continue;
                
                const nomeNormLocal = String(docLocal.nome || "").toUpperCase().trim();
                const idx = remotosRestantes.findIndex(dr => {
                  const nomeNormRemoto = dr.nome.toUpperCase().trim();
                  return nomeNormRemoto.includes(nomeNormLocal) || nomeNormLocal.includes(nomeNormRemoto);
                });

                if (idx !== -1) {
                  const matched = remotosRestantes[idx];
                  docUpdates.push(
                    supabase
                      .from("contrato_documentos")
                      .update({ m2a_documento_id: matched.id })
                      .eq("id", docLocal.id)
                  );
                  remotosRestantes.splice(idx, 1);
                  totalDocsVinculados++;
                }
              }
            }

            // 2.2 Para os documentos remotos que NÃO foram vinculados a um local,
            // criamos novos registros locais (para que apareçam na lista de docs)
            for (const dr of remotosRestantes) {
              docUpdates.push(
                supabase
                  .from("contrato_documentos")
                  .insert({
                    contrato_id: c.id,
                    nome: dr.nome,
                    m2a_documento_id: dr.id,
                    storage_path: `m2a/${c.id}/${dr.id}`,
                    tipo: 'gerado_portal'
                  })
              );
              totalDocsVinculados++;
            }

            if (docUpdates.length > 0) await Promise.all(docUpdates);
          }

          // 3. Atualizar a coluna m2a_documentos_gerados no contrato
          await supabase
            .from("contratos")
            .update({ 
              m2a_documentos_gerados: (data.documentos || []).map(d => ({ nome: d.nome, id_m2a: d.id })) as any 
            })
            .eq("id", c.id);

          sucessos++;
        } catch (err) {
          console.error(`Erro ao sincronizar contrato ${c.numero_contrato}:`, err);
          falhas++;
        }
      }

      const msgFinal = `Sincronização concluída: ${sucessos} sucesso(s), ${falhas} falha(s). ` +
                       `${totalItensAtualizados} itens e ${totalDocsVinculados} docs atualizados.`;
      
      finishTask(msgFinal);
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      notify.success("Sincronização do processo concluída.");
    } catch (e) {
      failTask(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }, [processoId, contratos, qc, startTask, updateProgress, finishTask, failTask]);

  return { sincronizar, sincronizando };
}
