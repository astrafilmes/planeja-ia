import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  FornecedorPreposto,
  JobRow,
  M2AAtaRow,
  M2AItemRow,
  ProcessoMin,
  SecretariaM2A,
} from "../lib";

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  runPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await runPage(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Reúne todas as queries do módulo `importar-contratos` num único hook.
 * Cada seção mantém sua queryKey original para preservar cache e invalidations
 * feitas por outros pontos do app.
 */
export function useImportQueries(options: { activeJobId: string | null }) {
  const { activeJobId } = options;

  const processos = useQuery({
    queryKey: ["processos-min"],
    queryFn: async () =>
      ((
        await supabase
          .from("processos")
          .select(
            "id, numero_processo, objeto, m2a_url, m2a_processo_id, m2a_sync_at",
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? []) as unknown as ProcessoMin[],
  });

  const secretarias = useQuery({
    queryKey: ["secretarias-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, m2a_ref_coluna, m2a_dotacao_default, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
        )
        .eq("ativa", true);
      // Tentar enriquecer com CPFs (apenas admin/gestor): falha silenciosa para outros papéis.
      let cpfs: Array<{
        id: string;
        m2a_gestor_cpf: string | null;
        m2a_fiscal_cpf: string | null;
      }> = [];
      try {
        const { data: rpcData, error } = await supabase.rpc(
          "get_secretarias_cpfs",
        );
        if (!error && Array.isArray(rpcData)) cpfs = rpcData as typeof cpfs;
      } catch {
        // usuário sem permissão -> seguimos sem CPFs
      }
      const cpfMap = new Map<
        string,
        { gestor: string | null; fiscal: string | null }
      >();
      cpfs.forEach((c) =>
        cpfMap.set(c.id, {
          gestor: c.m2a_gestor_cpf,
          fiscal: c.m2a_fiscal_cpf,
        }),
      );
      return (data ?? []).map((s: any) => ({
        ...s,
        m2a_fiscal_cpf: cpfMap.get(s.id)?.fiscal ?? null,
        m2a_gestor_cpf: cpfMap.get(s.id)?.gestor ?? null,
      })) as SecretariaM2A[];
    },
  });

  const fornecedoresPrepostos = useQuery({
    queryKey: ["fornecedores-prepostos-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores_prepostos")
        .select("*")
        .eq("ativo", true)
        .order("fornecedor_nome");
      if (error) throw error;
      return (data ?? []) as FornecedorPreposto[];
    },
  });

  const jobs = useQuery({
    queryKey: ["cij-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contrato_import_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as JobRow[];
    },
  });

  const jobDetail = useQuery({
    queryKey: ["cij-detail", activeJobId],
    enabled: !!activeJobId,
    queryFn: async () => {
      const [job, itens, dotacoes] = await Promise.all([
        supabase
          .from("contrato_import_jobs")
          .select("*")
          .eq("id", activeJobId!)
          .single(),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("contrato_import_itens")
            .select("*")
            .eq("job_id", activeJobId!)
            .order("source_row")
            .range(from, to),
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("contrato_import_dotacoes")
            .select("*")
            .eq("job_id", activeJobId!)
            .order("id")
            .range(from, to),
        ),
      ]);
      if (job.error) throw job.error;
      const expectedItens = Number((job.data as any)?.total_itens ?? 0);
      if (expectedItens && itens.length !== expectedItens) {
        console.warn("[m2a-import] divergência ao carregar itens do job", {
          jobId: activeJobId,
          esperado: expectedItens,
          carregado: itens.length,
        });
      }
      console.log("[m2a-import] detalhe do job carregado", {
        jobId: activeJobId,
        itens: itens.length,
        dotacoes: dotacoes.length,
      });
      return {
        job: job.data,
        itens,
        dotacoes,
      };
    },
  });

  const activeJobProcessoId = (jobDetail.data?.job as any)?.processo_id as
    | string
    | null
    | undefined;

  const m2aAtas = useQuery({
    queryKey: ["m2a-atas-import", activeJobProcessoId],
    enabled: !!activeJobProcessoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_atas")
        .select("m2a_ata_id, numero_ata, fornecedor_nome, fornecedor_cnpj")
        .eq("processo_id", activeJobProcessoId!)
        .order("numero_ata");
      if (error) throw error;
      return (data ?? []) as M2AAtaRow[];
    },
  });

  const m2aItens = useQuery({
    queryKey: ["m2a-itens-import", activeJobProcessoId],
    enabled: !!activeJobProcessoId,
    queryFn: async () => {
      return fetchAllPages<M2AItemRow>((from, to) =>
        supabase
          .from("m2a_itens")
          .select("m2a_ata_id, m2a_item_id, numero_item, descricao, unidade, valor_unitario")
          .eq("processo_id", activeJobProcessoId!)
          .order("numero_item")
          .range(from, to),
      );
    },
  });

  return {
    processos: (processos.data ?? []) as ProcessoMin[],
    secretarias: (secretarias.data ?? []) as SecretariaM2A[],
    fornecedoresPrepostos: (fornecedoresPrepostos.data ?? []) as FornecedorPreposto[],
    jobs: (jobs.data ?? []) as JobRow[],
    jobDetail: jobDetail.data,
    detailFetching: jobDetail.isFetching,
    activeJobProcessoId: activeJobProcessoId ?? null,
    m2aAtas: (m2aAtas.data ?? []) as M2AAtaRow[],
    m2aItens: (m2aItens.data ?? []) as M2AItemRow[],
  };
}
