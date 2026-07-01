import type { M2ADocumentoGerado } from "@/lib/m2a";

/* -------------------------------- Tipos -------------------------------- */

export type Processo = {
  id: string;
  numero_processo: string | null;
  ano: number | null;
  modalidade: string | null;
  objeto: string;
  status: string;
  data_abertura: string | null;
  observacoes: string | null;
  m2a_url: string | null;
  m2a_processo_id: string | null;
  secretaria_id: string | null;
  m2a_sync_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContratoItemM2A = {
  numero: string;
  quantidade: string;
  quantidade_numero: number;
  descricao?: string;
  m2a_item_id?: string | null;
  unidade?: string | null;
  valor_unitario?: number;
  valor_total?: number;
};

export type ContratoRow = {
  id: string;
  numero_contrato: string;
  dotacao: string | null;
  secretaria_id: string | null;
  secretaria_sigla: string;
  secretaria_nome: string | null;
  m2a_orgao_id: string | null;
  m2a_ata_id: string | null;
  m2a_ata_numero: string | null;
  m2a_dot_orgao_id: string | null;
  m2a_uo_id: string | null;
  m2a_dot_id: string | null;
  m2a_fiscal_codigo: string | null;
  m2a_fiscal_nome: string | null;
  m2a_gestor_codigo: string | null;
  m2a_gestor_nome: string | null;
  fornecedor_nome: string | null;
  preposto: string;
  objeto: string;
  status: string;
  data: string | null;
  data_texto_legado?: string | null;
  status_envio_m2a: string;
  ultimo_erro_m2a: string | null;
  m2a_contrato_id: string | null;
  m2a_documentos_gerados: unknown;
  enviado_m2a_em: string | null;
  impresso_assinado: boolean;
  publicado: boolean;
  valor_total: number;
  itens: ContratoItemM2A[];
};

export type ProcessoAtaItem = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  valor_unitario: number;
  m2a_item_id: string;
  m2a_ata_id: string;
};

export type ItemConsolidado = {
  codigo: string;
  descricao: string;
  unidade: string | null;
  quantidadeTotal: number | null;
  quantidadeConsumida: number;
  saldo: number | null;
  valorDisponivel: number | null;
  valorUnitario: number;
  valorUnitarioContratado: number;
  valorConsumido: number;
};

/* ----------------------------- Constantes ----------------------------- */

export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const DOCUMENTOS_DOWNLOAD_POSICOES = new Set([4, 5]);

/* ----------------------------- Utilitários ----------------------------- */

export function anoFromNumero(numero?: string | null): number | null {
  if (!numero) return null;
  const m = String(numero).match(/(\d{4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? y : null;
}

export function formatDateBR(value?: string | null) {
  if (!value) return "Sem data";
  const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatQuantidade(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function getStrictItemNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(raw.replace(",", "."));
  if (Number.isFinite(parsed)) return parsed;
  const firstNumber = raw.match(/\d+/)?.[0];
  return firstNumber ? Number(firstNumber) : Number.MAX_SAFE_INTEGER;
}

export function compareStrictItemOrder<T>(
  a: T,
  b: T,
  getValue: (item: T) => unknown,
) {
  const valueA = getValue(a);
  const valueB = getValue(b);
  const numA = getStrictItemNumber(valueA);
  const numB = getStrictItemNumber(valueB);
  if (numA !== numB) return numA - numB;
  return String(valueA ?? "").localeCompare(String(valueB ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function getContratoDocumentos(
  contrato: ContratoRow,
): M2ADocumentoGerado[] {
  if (!Array.isArray(contrato.m2a_documentos_gerados)) return [];
  return (contrato.m2a_documentos_gerados as any[])
    .map((item, index) => {
      if (!DOCUMENTOS_DOWNLOAD_POSICOES.has(index + 1)) return null;
      if (!item || typeof item !== "object") return null;
      const doc = item as { id_m2a?: unknown; id?: unknown; nome?: unknown };
      const id_m2a = String(doc.id_m2a ?? doc.id ?? "").trim();
      if (!/^\d+$/.test(id_m2a)) return null;
      return {
        id_m2a,
        nome: `${String(doc.nome ?? `Documento ${id_m2a}`).trim()} - ${contrato.numero_contrato}`,
        contratoId: contrato.id,
        contratoNumero: contrato.numero_contrato,
        m2aContratoId: contrato.m2a_contrato_id ?? undefined,
      };
    })
    .filter(Boolean) as M2ADocumentoGerado[];
}
