import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ContratoFull,
  DotacaoRow,
  ItemRow,
  SecretariaWithCpf,
} from "../lib";

export function useContratoDetalhe(id: string) {
  return useQuery({
    queryKey: ["contrato-full", id],
    queryFn: async (): Promise<ContratoFull | null> => {
      const { data: c, error: cErr } = await supabase
        .from("contratos")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!c) return null;

      const [itens, atores, docs, processo, secretaria, m2aAtas] =
        await Promise.all([
          supabase
            .from("contrato_itens")
            .select("*")
            .eq("contrato_id", id)
            .order("ordem_item"),
          supabase.from("contrato_atores").select("*").eq("contrato_id", id),
          supabase
            .from("contrato_documentos")
            .select("*")
            .eq("contrato_id", id),
          c.processo_id
            ? supabase
                .from("processos")
                .select("*")
                .eq("id", c.processo_id)
                .is("deleted_at", null)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          c.secretaria_id
            ? supabase
                .from("secretarias")
                .select(
                  "id, numero, sigla, nome, ativa, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_dotacao_default, m2a_ref_coluna, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
                )
                .eq("id", c.secretaria_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          c.processo_id
            ? supabase
                .from("m2a_atas")
                .select("m2a_ata_id, numero_ata, fornecedor_nome")
                .eq("processo_id", c.processo_id)
                .order("numero_ata", { ascending: true })
            : Promise.resolve({ data: [] }),
        ]);

      const itensList = (itens.data ?? []) as any[];
      const itemIds = itensList.map((i) => i.id);
      const dotMap: Record<string, DotacaoRow[]> = {};
      if (itemIds.length) {
        const { data: dots } = await supabase
          .from("contrato_item_dotacoes")
          .select("*")
          .in("item_id", itemIds);
        for (const d of (dots ?? []) as DotacaoRow[]) {
          (dotMap[d.item_id] ??= []).push(d);
        }
      }

      // CPFs sensíveis: só admin/gestor recebem; falha silenciosa para outros papéis.
      // Body explícito `{}` evita 400 do PostgREST.
      let secretariaWithCpf: SecretariaWithCpf | null =
        (secretaria.data as SecretariaWithCpf | null) ?? null;
      if (secretariaWithCpf?.id) {
        let cpfs: Array<{
          id: string;
          m2a_gestor_cpf: string | null;
          m2a_fiscal_cpf: string | null;
        }> = [];
        try {
          const { data, error: cpfErr } = await supabase.rpc(
            "get_secretarias_cpfs",
          );
          if (!cpfErr && Array.isArray(data)) cpfs = data as typeof cpfs;
        } catch {
          /* sem permissão */
        }
        const match = cpfs.find((cpf) => cpf.id === secretariaWithCpf!.id);
        secretariaWithCpf = {
          ...secretariaWithCpf,
          m2a_gestor_cpf: match?.m2a_gestor_cpf ?? null,
          m2a_fiscal_cpf: match?.m2a_fiscal_cpf ?? null,
        };
      }

      return {
        contrato: c as ContratoFull["contrato"],
        itens: itensList.map(
          (i): ItemRow => ({
            ...(i as ItemRow),
            dotacoes: dotMap[i.id] ?? [],
          }),
        ),
        atores: (atores.data ?? []) as ContratoFull["atores"],
        documentos: (docs.data ?? []) as ContratoFull["documentos"],
        processo: (processo.data ?? null) as ContratoFull["processo"],
        secretaria: secretariaWithCpf,
        m2aAtas: (m2aAtas.data ?? []) as ContratoFull["m2aAtas"],
      };
    },
  });
}
