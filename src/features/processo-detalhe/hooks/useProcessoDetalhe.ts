import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatM2AQuantity } from "@/lib/m2a";
import {
  compareStrictItemOrder,
  type ContratoItemM2A,
  type ContratoRow,
  type Processo,
  type ProcessoAtaItem,
} from "../lib";

export function useProcessoDetalhe(id: string) {
  return useQuery({
    queryKey: ["processo-detail", id],
    queryFn: async () => {
      const [proc, contratos, ataItens] = await Promise.all([
        supabase
          .from("processos")
          .select("*")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("contratos")
          .select(
            "id, numero_contrato, dotacao, secretaria_sigla, secretaria_id, preposto, objeto, status, data, data_texto_legado, status_envio_m2a, ultimo_erro_m2a, m2a_contrato_id, m2a_documentos_gerados, m2a_ata_id, m2a_ata_numero, fornecedor_nome, enviado_m2a_em, impresso_assinado, publicado, secretarias:secretaria_id(sigla, nome, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome)",
          )
          .eq("processo_id", id)
          .is("deleted_at", null)
          .order("numero_contrato"),
        supabase
          .from("m2a_itens")
          .select(
            "id, numero_item, descricao, unidade, valor_unitario, m2a_item_id, m2a_ata_id",
          )
          .eq("processo_id", id)
          .order("numero_item"),
      ]);
      if (proc.error) throw proc.error;
      if (contratos.error) throw contratos.error;
      if (ataItens.error) throw ataItens.error;

      const contratoRows = contratos.data ?? [];
      const contratoIds = contratoRows.map((c: any) => c.id);
      const valorByContrato: Record<string, number> = {};
      const itensByContrato: Record<string, ContratoItemM2A[]> = {};

      if (contratoIds.length > 0) {
        // PostgREST devolve no máximo 1000 linhas por request; um processo
        // pode ter milhares de contrato_itens (ex.: 4k+). Sem paginação,
        // contratos além do corte apareciam com R$ 0,00 e sem itens no envio
        // ao portal ("Contrato sem itens para envio").
        const PAGE = 1000;
        const itens: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: page, error: itensError } = await supabase
            .from("contrato_itens")
            .select(
              "contrato_id, numero_item, ordem_item, descricao, m2a_item_id, quantidade, unidade, valor_unitario, valor_total",
            )
            .in("contrato_id", contratoIds)
            .order("contrato_id", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (itensError) throw itensError;
          const rows = page ?? [];
          itens.push(...rows);
          if (rows.length < PAGE) break;
        }


        const m2aItemIds = [
          ...new Set(
            (itens ?? [])
              .map((it) => String(it.m2a_item_id ?? "").trim())
              .filter(Boolean),
          ),
        ];
        const m2aNumeroByItemId = new Map<string, string>();
        if (m2aItemIds.length > 0) {
          const { data: m2aItens, error: m2aItensError } = await supabase
            .from("m2a_itens")
            .select("m2a_item_id, numero_item")
            .eq("processo_id", id)
            .in("m2a_item_id", m2aItemIds);
          if (m2aItensError) throw m2aItensError;
          for (const item of m2aItens ?? []) {
            m2aNumeroByItemId.set(
              item.m2a_item_id,
              String(item.numero_item ?? "").trim(),
            );
          }
        }

        for (const it of itens ?? []) {
          valorByContrato[it.contrato_id] =
            (valorByContrato[it.contrato_id] ?? 0) +
            Number(it.valor_total ?? 0);
          const numero =
            String(it.numero_item ?? "").trim() ||
            m2aNumeroByItemId.get(String(it.m2a_item_id ?? "").trim()) ||
            "";
          const descricao = String(it.descricao ?? "").trim();
          if (!numero && !descricao) continue;
          if (!itensByContrato[it.contrato_id]) {
            itensByContrato[it.contrato_id] = [];
          }
          itensByContrato[it.contrato_id].push({
            numero,
            quantidade: formatM2AQuantity(it.quantidade),
            quantidade_numero: Number(it.quantidade ?? 0),
            descricao,
            m2a_item_id: it.m2a_item_id ?? null,
            unidade: it.unidade ?? null,
            valor_unitario: Number(it.valor_unitario ?? 0),
            valor_total: Number(it.valor_total ?? 0),
          });
        }
      }

      for (const lista of Object.values(itensByContrato)) {
        lista.sort((a, b) =>
          compareStrictItemOrder(a, b, (item) => item.numero),
        );
      }

      const contratosFull: ContratoRow[] = contratoRows.map((c: any) => ({
        id: c.id,
        numero_contrato: c.numero_contrato,
        dotacao: c.dotacao ?? null,
        secretaria_id: c.secretaria_id ?? null,
        secretaria_sigla: c.secretarias?.sigla ?? c.secretaria_sigla ?? "",
        secretaria_nome: c.secretarias?.nome ?? null,
        m2a_orgao_id: c.secretarias?.m2a_orgao_id ?? null,
        m2a_ata_id: c.m2a_ata_id ?? null,
        m2a_ata_numero: c.m2a_ata_numero ?? null,
        m2a_dot_orgao_id: c.secretarias?.m2a_dot_orgao_id ?? null,
        m2a_uo_id: c.secretarias?.m2a_uo_id ?? null,
        m2a_dot_id: c.secretarias?.m2a_dot_id ?? null,
        m2a_fiscal_codigo: c.secretarias?.m2a_fiscal_codigo ?? null,
        m2a_fiscal_nome: c.secretarias?.m2a_fiscal_nome ?? null,
        m2a_gestor_codigo: c.secretarias?.m2a_gestor_codigo ?? null,
        m2a_gestor_nome: c.secretarias?.m2a_gestor_nome ?? null,
        fornecedor_nome: c.fornecedor_nome ?? null,
        preposto: c.preposto,
        objeto: c.objeto,
        status: c.status,
        data: c.data,
        data_texto_legado: c.data_texto_legado ?? null,
        status_envio_m2a: c.status_envio_m2a,
        ultimo_erro_m2a: c.ultimo_erro_m2a,
        m2a_contrato_id: c.m2a_contrato_id,
        m2a_documentos_gerados: c.m2a_documentos_gerados,
        enviado_m2a_em: c.enviado_m2a_em,
        impresso_assinado: !!c.impresso_assinado,
        publicado: !!c.publicado,
        valor_total: valorByContrato[c.id] ?? 0,
        itens: itensByContrato[c.id] ?? [],
      }));

      return {
        processo: proc.data as Processo | null,
        contratos: contratosFull,
        ataItens: ((ataItens.data ?? []) as any[])
          .map(
            (item): ProcessoAtaItem => ({
              id: item.id,
              codigo:
                String(item.numero_item ?? "").trim() || item.m2a_item_id,
              descricao: item.descricao ?? "Item sem descrição",
              unidade: item.unidade ?? null,
              valor_unitario: Number(item.valor_unitario ?? 0),
              m2a_item_id: item.m2a_item_id,
              m2a_ata_id: item.m2a_ata_id,
            }),
          )
          .sort((a, b) =>
            compareStrictItemOrder(a, b, (item) => item.codigo),
          ),
      };
    },
  });
}
