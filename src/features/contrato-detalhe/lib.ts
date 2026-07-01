/* -------------------------------- Tipos -------------------------------- */

export type DotacaoRow = {
  id: string;
  item_id: string;
  [key: string]: unknown;
};

export type ItemRow = {
  id: string;
  contrato_id: string;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | string | null;
  valor_unitario: number | string | null;
  valor_total: number | string | null;
  lote: string | null;
  especificacao: string | null;
  numero_item: string | number | null;
  ordem_item: number | null;
  m2a_item_id: string | null;
  dotacoes: DotacaoRow[];
  [key: string]: unknown;
};

export type ContratoRow = {
  id: string;
  numero_contrato: string;
  objeto: string;
  preposto: string;
  fiscal: string | null;
  data: string | null;
  data_texto_legado: string | null;
  status: string;
  status_envio_m2a: string | null;
  ultimo_erro_m2a: string | null;
  m2a_ata_id: string | null;
  m2a_ata_numero: string | null;
  m2a_contrato_id: string | null;
  m2a_documentos_gerados: unknown;
  enviado_m2a_em: string | null;
  fornecedor_nome: string | null;
  secretaria_id: string | null;
  secretaria_sigla: string;
  processo_id: string | null;
  import_job_id: string | null;
  impresso_assinado?: boolean | null;
  publicado?: boolean | null;
  [key: string]: unknown;
};

export type SecretariaWithCpf = {
  id: string;
  numero: string | null;
  sigla: string;
  nome: string | null;
  ativa: boolean | null;
  m2a_orgao_id: string | null;
  m2a_dot_orgao_id: string | null;
  m2a_uo_id: string | null;
  m2a_dot_id: string | null;
  m2a_dotacao_default: string | null;
  m2a_ref_coluna: string | null;
  m2a_fiscal_codigo: string | null;
  m2a_fiscal_nome: string | null;
  m2a_gestor_codigo: string | null;
  m2a_gestor_nome: string | null;
  m2a_gestor_cpf: string | null;
  m2a_fiscal_cpf: string | null;
};

export type M2AAtaOption = {
  m2a_ata_id: string;
  numero_ata: string | null;
  fornecedor_nome: string | null;
};

export type ProcessoResumo = {
  id: string;
  numero_processo: string | null;
  m2a_url: string | null;
  m2a_processo_id: string | null;
  [key: string]: unknown;
};

export type AtorRow = {
  id: string;
  contrato_id: string;
  tipo: string;
  nome: string | null;
  cpf: string | null;
  [key: string]: unknown;
};

export type DocumentoRow = {
  id: string;
  contrato_id: string;
  nome: string | null;
  url: string | null;
  [key: string]: unknown;
};

export type ContratoFull = {
  contrato: ContratoRow;
  itens: ItemRow[];
  atores: AtorRow[];
  documentos: DocumentoRow[];
  processo: ProcessoResumo | null;
  secretaria: SecretariaWithCpf | null;
  m2aAtas: M2AAtaOption[];
};

export type ItemEditForm = {
  descricao: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
};

export type ItemActionKind = "edit" | "delete";

/* ----------------------------- Constantes ----------------------------- */

export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const ITEM_WARN_KEY = "warn-edit-item";

/* ----------------------------- Utilitários ----------------------------- */

export function formatDateBR(value?: string | null) {
  if (!value) return "Sem data";
  const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

export function calcValorTotal(itens: ItemRow[]): number {
  return itens.reduce(
    (s, it) =>
      s +
      Number(
        it.valor_total ??
          Number(it.quantidade ?? 0) * Number(it.valor_unitario ?? 0),
      ),
    0,
  );
}

export function calcQuantidadeTotal(itens: ItemRow[]): number {
  return itens.reduce((s, it) => s + Number(it.quantidade ?? 0), 0);
}

export function itemRowToEditForm(item: ItemRow): ItemEditForm {
  return {
    descricao: item.descricao ?? "",
    unidade: item.unidade ?? "",
    quantidade: String(item.quantidade ?? ""),
    valor_unitario: String(item.valor_unitario ?? ""),
  };
}

export function documentosM2ACount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
