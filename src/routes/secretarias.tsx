import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/route-head";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  Layers3,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  filterServidoresByUnidade,
  type M2AServidor,
  type M2AUnidadeGestora,
  useServidores,
  useUnidadesGestoras,
} from "@/hooks/useM2ACatalog";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/secretarias")({
  component: Page,
  head: () =>
    routeHead({
      path: "/secretarias",
      title: "Secretarias",
      description:
        "Cadastre e organize as secretarias requisitantes participantes do planejamento de contratações.",
    }),
});

const EMPTY_SELECT_VALUE = "__none__";
const KEEP_SELECT_VALUE = "__keep__";

type Sec = {
  id?: string;
  numero: number;
  sigla: string;
  nome: string;
  ativa: boolean;
  m2a_orgao_id?: string | null;
  m2a_dot_orgao_id?: string | null;
  m2a_uo_id?: string | null;
  m2a_dot_id?: string | null;
  m2a_dotacao_default?: string | null;
  m2a_ref_coluna?: number | null;
  m2a_fiscal_codigo?: string | null;
  m2a_fiscal_nome?: string | null;
  m2a_fiscal_cpf?: string | null;
  m2a_gestor_codigo?: string | null;
  m2a_gestor_nome?: string | null;
  m2a_gestor_cpf?: string | null;
};

type EnrichedSec = Sec & {
  fiscal?: M2AServidor | null;
  gestor?: M2AServidor | null;
  unidade?: M2AUnidadeGestora | null;
};

type SecretariaGroup = {
  key: string;
  title: string;
  subtitle: string;
  unidadeM2AId: string | null;
  rows: EnrichedSec[];
  principal: EnrichedSec;
  fiscaisCount: number;
  gestoresCount: number;
  ativosCount: number;
};

type GroupForm = {
  unidadeM2AId: string;
  dotacaoOrgaoM2AId: string;
  fiscalM2AId: string;
  gestorM2AId: string;
};

function emptySec(): Sec {
  return { numero: 0, sigla: "", nome: "", ativa: true };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

function isNumericM2AId(value: string | null | undefined) {
  return !value || /^\d+$/.test(value.trim());
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toSecretariaPayload(sec: Sec) {
  return {
    numero: Number(sec.numero),
    sigla: sec.sigla.trim().toUpperCase(),
    nome: sec.nome.trim(),
    ativa: sec.ativa,
    m2a_orgao_id: trimOrNull(sec.m2a_orgao_id),
    m2a_dot_orgao_id: trimOrNull(sec.m2a_dot_orgao_id),
    m2a_uo_id: trimOrNull(sec.m2a_uo_id),
    m2a_dot_id: trimOrNull(sec.m2a_dot_id),
    m2a_dotacao_default: trimOrNull(sec.m2a_dotacao_default),
    m2a_ref_coluna:
      sec.m2a_ref_coluna === null || sec.m2a_ref_coluna === undefined
        ? null
        : Number(sec.m2a_ref_coluna),
    m2a_fiscal_codigo: trimOrNull(sec.m2a_fiscal_codigo),
    m2a_fiscal_nome: trimOrNull(sec.m2a_fiscal_nome),
    m2a_fiscal_cpf: trimOrNull(sec.m2a_fiscal_cpf),
    m2a_gestor_codigo: trimOrNull(sec.m2a_gestor_codigo),
    m2a_gestor_nome: trimOrNull(sec.m2a_gestor_nome),
    m2a_gestor_cpf: trimOrNull(sec.m2a_gestor_cpf),
  };
}

function actorPatch(prefix: "m2a_fiscal" | "m2a_gestor", actor?: M2AServidor) {
  return {
    [`${prefix}_codigo`]: actor?.m2a_id ?? null,
    [`${prefix}_nome`]: actor?.nome ?? null,
    [`${prefix}_cpf`]: actor?.cpf ?? null,
  };
}

function pickPrincipal(
  rows: EnrichedSec[],
  unidade?: M2AUnidadeGestora | null,
) {
  const normalizedUnidade = normalizeText(unidade?.nome);
  const exact = rows.find(
    (row) => normalizeText(row.nome) === normalizedUnidade,
  );
  if (exact) return exact;

  return [...rows].sort((a, b) => {
    const aPenalty = /[-(]/.test(a.nome) ? 1 : 0;
    const bPenalty = /[-(]/.test(b.nome) ? 1 : 0;
    return aPenalty - bPenalty || a.nome.length - b.nome.length;
  })[0];
}

function groupRows(
  rows: EnrichedSec[],
  unidades: M2AUnidadeGestora[],
): SecretariaGroup[] {
  const unidadeByM2A = new Map(unidades.map((item) => [item.m2a_id, item]));
  const map = new Map<string, EnrichedSec[]>();

  for (const row of rows) {
    const key = row.m2a_orgao_id || `sem-ug-${row.numero}-${row.sigla}`;
    map.set(key, [...(map.get(key) ?? []), row]);
  }

  return [...map.entries()]
    .map(([key, group]) => {
      const unidade = group[0]?.m2a_orgao_id
        ? (unidadeByM2A.get(group[0].m2a_orgao_id) ?? null)
        : null;
      const sortedRows = [...group].sort(
        (a, b) =>
          a.numero - b.numero ||
          a.sigla.localeCompare(b.sigla, "pt-BR", { numeric: true }) ||
          a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
      );
      const principal = pickPrincipal(sortedRows, unidade);
      const fiscais = new Set(
        sortedRows.map((row) => row.m2a_fiscal_codigo).filter(Boolean),
      );
      const gestores = new Set(
        sortedRows.map((row) => row.m2a_gestor_codigo).filter(Boolean),
      );

      return {
        key,
        title: unidade?.nome ?? principal.nome,
        subtitle: unidade
          ? `${unidade.sigla ?? principal.sigla} · ID ${unidade.m2a_id}`
          : `${principal.sigla} · Unidade Gestora não vinculada`,
        unidadeM2AId: unidade?.m2a_id ?? principal.m2a_orgao_id ?? null,
        rows: sortedRows,
        principal,
        fiscaisCount: fiscais.size,
        gestoresCount: gestores.size,
        ativosCount: sortedRows.filter((row) => row.ativa).length,
      };
    })
    .sort(
      (a, b) =>
        a.principal.numero - b.principal.numero ||
        a.title.localeCompare(b.title, "pt-BR", { numeric: true }),
    );
}

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sec>(emptySec());
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Sec | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "ativa" | "inativa">(
    "all",
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupEditing, setGroupEditing] = useState<SecretariaGroup | null>(
    null,
  );
  const [groupForm, setGroupForm] = useState<GroupForm>({
    unidadeM2AId: EMPTY_SELECT_VALUE,
    dotacaoOrgaoM2AId: KEEP_SELECT_VALUE,
    fiscalM2AId: EMPTY_SELECT_VALUE,
    gestorM2AId: EMPTY_SELECT_VALUE,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, ativa, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_dotacao_default, m2a_ref_coluna, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
        )
        .order("numero");
      if (error) throw error;
      // CPFs sensíveis: só admin/gestor conseguem; merge via RPC quando autorizado.
      // Body explícito `{}` evita 400 do PostgREST.
      let cpfs: Array<{ id: string; m2a_gestor_cpf: string | null; m2a_fiscal_cpf: string | null }> = [];
      try {
        const { data, error: rpcErr } = await supabase.rpc("get_secretarias_cpfs");
        if (!rpcErr && Array.isArray(data)) cpfs = data as typeof cpfs;
      } catch {
        /* sem permissão, segue sem CPFs */
      }
      const cpfMap = new Map<string, { gestor: string | null; fiscal: string | null }>();
      cpfs.forEach((c) =>
        cpfMap.set(c.id, { gestor: c.m2a_gestor_cpf, fiscal: c.m2a_fiscal_cpf }),
      );
      return (data ?? []).map((s: any) => ({
        ...s,
        m2a_gestor_cpf: cpfMap.get(s.id)?.gestor ?? null,
        m2a_fiscal_cpf: cpfMap.get(s.id)?.fiscal ?? null,
      })) as Sec[];
    },
  });

  const { data: unidadesGestoras = [] } = useUnidadesGestoras();
  const { data: fiscais = [] } = useServidores("FISCAL");
  const { data: gestores = [] } = useServidores("GESTOR");

  const unidadeByM2A = useMemo(
    () => new Map(unidadesGestoras.map((item) => [item.m2a_id, item])),
    [unidadesGestoras],
  );

  const enrichedRows = useMemo(() => {
    return (data ?? []).map((secretaria) => ({
      ...secretaria,
      unidade: secretaria.m2a_orgao_id
        ? (unidadeByM2A.get(secretaria.m2a_orgao_id) ?? null)
        : null,
      fiscal: secretaria.m2a_fiscal_codigo
        ? fiscais.find(
            (fiscal) => fiscal.m2a_id === secretaria.m2a_fiscal_codigo,
          )
        : null,
      gestor: secretaria.m2a_gestor_codigo
        ? gestores.find(
            (gestor) => gestor.m2a_id === secretaria.m2a_gestor_codigo,
          )
        : null,
    }));
  }, [data, fiscais, gestores, unidadeByM2A]);

  const filteredRows = useMemo(() => {
    const q = normalizeText(search);
    return enrichedRows
      .filter((row) => {
        if (statusFilter === "ativa" && !row.ativa) return false;
        if (statusFilter === "inativa" && row.ativa) return false;
        if (!q) return true;

        const searchable = [
          row.numero,
          row.sigla,
          row.nome,
          row.m2a_dotacao_default,
          row.m2a_orgao_id,
          row.m2a_dot_orgao_id,
          row.m2a_uo_id,
          row.m2a_dot_id,
          row.fiscal?.nome ?? row.m2a_fiscal_nome,
          row.gestor?.nome ?? row.m2a_gestor_nome,
          row.unidade?.nome,
        ].join(" ");

        return normalizeText(searchable).includes(q);
      })
      .sort(
        (a, b) =>
          a.numero - b.numero ||
          a.sigla.localeCompare(b.sigla, "pt-BR", { numeric: true }) ||
          a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
      );
  }, [enrichedRows, search, statusFilter]);

  const secretariaGroups = useMemo(
    () => groupRows(filteredRows, unidadesGestoras),
    [filteredRows, unidadesGestoras],
  );

  const duplicateServidorNames = useMemo(() => {
    const byName = new Map<string, M2AServidor[]>();
    for (const servidor of [...fiscais, ...gestores]) {
      const key = `${servidor.cargo}:${normalizeText(servidor.nome)}`;
      byName.set(key, [...(byName.get(key) ?? []), servidor]);
    }
    return [...byName.values()]
      .filter((items) => items.length > 1)
      .sort((a, b) => a[0].nome.localeCompare(b[0].nome, "pt-BR"));
  }, [fiscais, gestores]);

  const groupFiscais = useMemo(
    () =>
      filterServidoresByUnidade(
        fiscais,
        groupForm.unidadeM2AId === EMPTY_SELECT_VALUE
          ? null
          : groupForm.unidadeM2AId,
      ),
    [fiscais, groupForm.unidadeM2AId],
  );
  const groupGestores = useMemo(
    () =>
      filterServidoresByUnidade(
        gestores,
        groupForm.unidadeM2AId === EMPTY_SELECT_VALUE
          ? null
          : groupForm.unidadeM2AId,
      ),
    [gestores, groupForm.unidadeM2AId],
  );

  const rowFiscais = useMemo(
    () => filterServidoresByUnidade(fiscais, editing.m2a_orgao_id),
    [fiscais, editing.m2a_orgao_id],
  );
  const rowGestores = useMemo(
    () => filterServidoresByUnidade(gestores, editing.m2a_orgao_id),
    [gestores, editing.m2a_orgao_id],
  );

  useEffect(() => {
    if (!open) setEditing(emptySec());
  }, [open]);

  function invalidateSecretarias() {
    qc.invalidateQueries({ queryKey: ["secretarias"] });
    qc.invalidateQueries({ queryKey: ["m2a-servidores"] });
  }

  function openNew() {
    setEditing(emptySec());
    setOpen(true);
  }

  function openEdit(secretaria: Sec) {
    setEditing({ ...secretaria });
    setOpen(true);
  }

  function openGroupEdit(group: SecretariaGroup) {
    const dotacaoOrgaoIds = new Set(
      group.rows.map((row) => row.m2a_dot_orgao_id ?? EMPTY_SELECT_VALUE),
    );
    setGroupEditing(group);
    setGroupForm({
      unidadeM2AId: group.unidadeM2AId ?? EMPTY_SELECT_VALUE,
      dotacaoOrgaoM2AId:
        dotacaoOrgaoIds.size === 1
          ? [...dotacaoOrgaoIds][0]
          : KEEP_SELECT_VALUE,
      fiscalM2AId:
        group.fiscaisCount === 1
          ? (group.principal.m2a_fiscal_codigo ?? EMPTY_SELECT_VALUE)
          : KEEP_SELECT_VALUE,
      gestorM2AId:
        group.gestoresCount === 1
          ? (group.principal.m2a_gestor_codigo ?? EMPTY_SELECT_VALUE)
          : KEEP_SELECT_VALUE,
    });
  }

  function toggleGroup(key: string, openValue: boolean) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (openValue) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function validateSecretaria(sec: Sec) {
    if (!sec.sigla || !sec.nome || !sec.numero) {
      toast.error("Número, sigla e nome são obrigatórios.");
      return false;
    }

    const invalidFields = [
      !isNumericM2AId(sec.m2a_orgao_id) ? "Unidade Gestora" : null,
      !isNumericM2AId(sec.m2a_dot_orgao_id) ? "Órgão da Dotação" : null,
      !isNumericM2AId(sec.m2a_uo_id) ? "Unidade Orçamentária" : null,
      !isNumericM2AId(sec.m2a_dot_id) ? "Dotação" : null,
      !isNumericM2AId(sec.m2a_fiscal_codigo) ? "Fiscal" : null,
      !isNumericM2AId(sec.m2a_gestor_codigo) ? "Gestor" : null,
    ].filter(Boolean);

    if (invalidFields.length > 0) {
      toast.error("Use apenas IDs numéricos.", {
        description: invalidFields.join(", "),
      });
      return false;
    }

    return true;
  }

  async function save() {
    if (!validateSecretaria(editing)) return;

    const payload = toSecretariaPayload(editing);
    const result = editing.id
      ? await supabase.from("secretarias").update(payload).eq("id", editing.id)
      : await supabase.from("secretarias").insert(payload);

    if (result.error) return toast.error(result.error.message);

    await logAudit({
      action: editing.id ? "update" : "insert",
      entityType: "secretaria",
      entityId: editing.id ?? null,
      payload,
    });

    toast.success("Secretaria salva.");
    setOpen(false);
    invalidateSecretarias();
  }

  async function saveGroup() {
    if (!groupEditing) return;
    if (groupForm.unidadeM2AId === EMPTY_SELECT_VALUE) {
      return toast.error("Selecione a Unidade Gestora do grupo.");
    }
    if (
      groupForm.dotacaoOrgaoM2AId !== KEEP_SELECT_VALUE &&
      groupForm.dotacaoOrgaoM2AId !== EMPTY_SELECT_VALUE &&
      !isNumericM2AId(groupForm.dotacaoOrgaoM2AId)
    ) {
      return toast.error("Órgão da Dotação deve ser numérico.");
    }

    const fiscal = fiscais.find(
      (item) => item.m2a_id === groupForm.fiscalM2AId,
    );
    const gestor = gestores.find(
      (item) => item.m2a_id === groupForm.gestorM2AId,
    );

    if (
      groupForm.fiscalM2AId !== KEEP_SELECT_VALUE &&
      groupForm.fiscalM2AId !== EMPTY_SELECT_VALUE &&
      !fiscal
    ) {
      return toast.error("Fiscal inválido para esta Unidade Gestora.");
    }
    if (
      groupForm.gestorM2AId !== KEEP_SELECT_VALUE &&
      groupForm.gestorM2AId !== EMPTY_SELECT_VALUE &&
      !gestor
    ) {
      return toast.error("Gestor inválido para esta Unidade Gestora.");
    }

    const ids = groupEditing.rows
      .map((row) => row.id)
      .filter(Boolean) as string[];
    const payload = {
      m2a_orgao_id: groupForm.unidadeM2AId,
      ...(groupForm.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
        ? {}
        : {
            m2a_dot_orgao_id:
              groupForm.dotacaoOrgaoM2AId === EMPTY_SELECT_VALUE
                ? null
                : groupForm.dotacaoOrgaoM2AId,
          }),
      ...(groupForm.fiscalM2AId === KEEP_SELECT_VALUE
        ? {}
        : actorPatch("m2a_fiscal", fiscal)),
      ...(groupForm.gestorM2AId === KEEP_SELECT_VALUE
        ? {}
        : actorPatch("m2a_gestor", gestor)),
    };

    const { error } = await supabase
      .from("secretarias")
      .update(payload)
      .in("id", ids);

    if (error) return toast.error(error.message);

    await logAudit({
      action: "bulk_update",
      entityType: "secretaria_grupo",
      entityId: groupEditing.key,
      payload: { ...payload, registros: ids.length },
    });

    toast.success(
      `${ids.length} dotação(ões) atualizada(s) para ${groupEditing.title}.`,
    );
    setGroupEditing(null);
    invalidateSecretarias();
  }

  async function handleDelete() {
    if (!deleting?.id) return;
    const { error } = await supabase
      .from("secretarias")
      .delete()
      .eq("id", deleting.id);

    if (error) return toast.error(error.message);

    await logAudit({
      action: "delete",
      entityType: "secretaria",
      entityId: deleting.id,
      payload: { sigla: deleting.sigla, nome: deleting.nome },
    });

    toast.success("Secretaria excluída.");
    setDeleting(null);
    invalidateSecretarias();
  }

  const field = (
    key: keyof Sec,
    label: string,
    type: string = "text",
    placeholder?: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={(editing as any)[key] ?? ""}
        onChange={(event) =>
          setEditing({
            ...editing,
            [key]:
              type === "number"
                ? event.target.value === ""
                  ? null
                  : Number(event.target.value)
                : event.target.value,
          })
        }
      />
    </div>
  );

  const renderActor = (
    actor: M2AServidor | null | undefined,
    fallbackName: string | null | undefined,
  ) => {
    if (!actor && !fallbackName)
      return <span className="text-muted-foreground">—</span>;
    return (
      <div className="min-w-0">
        <div
          className="truncate font-medium"
          title={actor?.nome ?? fallbackName ?? ""}
        >
          {actor?.nome ?? fallbackName}
        </div>
        {actor?.m2a_id && (
          <div className="font-mono text-[11px] text-muted-foreground">
            ID {actor.m2a_id}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell
      title="Secretarias"
      subtitle="Unidades gestoras, dotações e responsáveis por grupo"
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" /> Nova
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] max-w-xl flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar secretaria, dotação, fiscal, gestor ou código..."
              className="h-9 pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as any)}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="inativa">Inativas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setExpandedGroups(
                new Set(secretariaGroups.map((group) => group.key)),
              )
            }
          >
            Expandir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedGroups(new Set())}
          >
            Recolher
          </Button>
        </div>

        <Card className="border-slate-200 bg-white p-3 text-[13px] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 font-medium">
            <UsersRound className="size-3.5 text-slate-500" />
            Nomes repetidos no catálogo
          </div>
          <div className="mt-1 text-slate-500 dark:text-slate-400">
            {duplicateServidorNames.length === 0
              ? "Nenhum duplicado encontrado."
              : `${duplicateServidorNames.length} nome(s) ainda possuem mais de um código externo.`}
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
        <Badge variant="secondary">{secretariaGroups.length} grupo(s)</Badge>
        <Badge variant="outline">
          {filteredRows.length} de {data?.length ?? 0} dotação(ões)
        </Badge>
        <span>
          A edição do grupo aplica Unidade Gestora, Fiscal e Gestor em todas as
          dotações vinculadas.
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading && (
          <Card className="border-slate-200 p-8 text-center text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Carregando secretarias...
          </Card>
        )}

        {!isLoading && secretariaGroups.length === 0 && (
          <Card className="border-slate-200 dark:border-slate-800">
            <EmptyState
              icon={Building2}
              title="Nenhuma secretaria encontrada"
              description="Ajuste os filtros ou cadastre uma nova secretaria."
              action={
                <Button size="sm" onClick={openNew}>
                  <Plus className="size-4" /> Nova secretaria
                </Button>
              }
            />
          </Card>
        )}

        {secretariaGroups.map((group) => {
          const isOpen = expandedGroups.has(group.key);
          const hasMixedFiscal = group.fiscaisCount > 1;
          const hasMixedGestor = group.gestoresCount > 1;

          return (
            <Collapsible
              key={group.key}
              open={isOpen}
              onOpenChange={(value) => toggleGroup(group.key, value)}
            >
              <Card className="overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#0B0F19]">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          !isOpen && "-rotate-90",
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {group.title}
                    </div>
                    <div className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                      {group.subtitle}
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 lg:flex">
                    <Badge variant="outline">
                      {group.ativosCount}/{group.rows.length} ativa(s)
                    </Badge>
                    {hasMixedFiscal && (
                      <Badge variant="secondary">Fiscal misto</Badge>
                    )}
                    {hasMixedGestor && (
                      <Badge variant="secondary">Gestor misto</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openGroupEdit(group)}
                  >
                    <UsersRound className="size-3.5" />
                    Editar grupo
                  </Button>
                </div>

                <CollapsibleContent>
                  <div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Nº</TableHead>
                          <TableHead className="w-24">Sigla</TableHead>
                          <TableHead>Secretaria / dotação</TableHead>
                          <TableHead className="w-64">Fiscal</TableHead>
                          <TableHead className="w-64">Gestor</TableHead>
                          <TableHead className="w-24 text-right">
                            Ações
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(!row.ativa && "opacity-50")}
                          >
                            <TableCell className="font-mono text-xs">
                              {row.numero}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {row.sigla}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-[320px]">
                              <div
                                className="truncate text-sm font-medium"
                                title={row.nome}
                              >
                                {row.nome}
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {row.m2a_dotacao_default && (
                                  <span className="font-mono">
                                    {row.m2a_dotacao_default}
                                  </span>
                                )}
                                {row.m2a_dot_orgao_id && (
                                  <span className="font-mono">
                                    ORG DOT {row.m2a_dot_orgao_id}
                                  </span>
                                )}
                                {row.m2a_uo_id && (
                                  <span className="font-mono">
                                    UO {row.m2a_uo_id}
                                  </span>
                                )}
                                {row.m2a_dot_id && (
                                  <span className="font-mono">
                                    DOT {row.m2a_dot_id}
                                  </span>
                                )}
                                {row.id === group.principal.id && (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    Principal
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {renderActor(row.fiscal, row.m2a_fiscal_nome)}
                            </TableCell>
                            <TableCell>
                              {renderActor(row.gestor, row.m2a_gestor_nome)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  onClick={() => openEdit(row)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleting(row)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <Dialog
        open={!!groupEditing}
        onOpenChange={(value) => {
          if (!value) setGroupEditing(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar grupo de secretarias</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-[#0B0F19]">
              <div className="font-medium">{groupEditing?.title}</div>
              <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                Esta ação atualiza {groupEditing?.rows.length ?? 0} dotação(ões)
                do grupo de uma só vez.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>Unidade Gestora</Label>
                <Select
                  value={groupForm.unidadeM2AId}
                  onValueChange={(value) =>
                    setGroupForm((current) => ({
                      ...current,
                      unidadeM2AId: value,
                      fiscalM2AId: EMPTY_SELECT_VALUE,
                      gestorM2AId: EMPTY_SELECT_VALUE,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                      Selecione
                    </SelectItem>
                    {unidadesGestoras.map((unidade) => (
                      <SelectItem key={unidade.id_local} value={unidade.m2a_id}>
                        {unidade.nome} - ID {unidade.m2a_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Órgão da Dotação</Label>
                <Input
                  inputMode="numeric"
                  placeholder={
                    groupForm.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
                      ? "Manter atual"
                      : "10026"
                  }
                  value={
                    groupForm.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
                      ? ""
                      : groupForm.dotacaoOrgaoM2AId
                  }
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    setGroupForm((current) => ({
                      ...current,
                      dotacaoOrgaoM2AId: value || EMPTY_SELECT_VALUE,
                    }));
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Fiscal padrão</Label>
                <Select
                  value={groupForm.fiscalM2AId}
                  onValueChange={(value) =>
                    setGroupForm((current) => ({
                      ...current,
                      fiscalM2AId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP_SELECT_VALUE} className="italic">
                      Manter atual
                    </SelectItem>
                    <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                      Nenhum
                    </SelectItem>
                    {groupFiscais.map((fiscal) => (
                      <SelectItem key={fiscal.id_local} value={fiscal.m2a_id}>
                        {fiscal.nome} - ID {fiscal.m2a_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Gestor padrão</Label>
                <Select
                  value={groupForm.gestorM2AId}
                  onValueChange={(value) =>
                    setGroupForm((current) => ({
                      ...current,
                      gestorM2AId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP_SELECT_VALUE} className="italic">
                      Manter atual
                    </SelectItem>
                    <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                      Nenhum
                    </SelectItem>
                    {groupGestores.map((gestor) => (
                      <SelectItem key={gestor.id_local} value={gestor.m2a_id}>
                        {gestor.nome} - ID {gestor.m2a_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGroupEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={saveGroup}>Aplicar ao grupo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setEditing(emptySec());
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing.id ? "Editar" : "Nova"} secretaria/dotação
            </DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-[120px_160px_1fr]">
              {field("numero", "Número *", "number")}
              {field("sigla", "Sigla *", "text", "SAU")}
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editing.ativa}
                    onCheckedChange={(checked) =>
                      setEditing({ ...editing, ativa: checked === true })
                    }
                  />
                  Ativa
                </label>
              </div>
            </div>

            {field("nome", "Nome *")}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-[#0B0F19]">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Layers3 className="size-3.5" />
                Parâmetros externos
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Unidade Gestora</Label>
                  <Select
                    value={editing.m2a_orgao_id ?? EMPTY_SELECT_VALUE}
                    onValueChange={(value) => {
                      setEditing((current) => ({
                        ...current,
                        m2a_orgao_id:
                          value === EMPTY_SELECT_VALUE ? null : value,
                        m2a_fiscal_codigo: null,
                        m2a_fiscal_nome: null,
                        m2a_fiscal_cpf: null,
                        m2a_gestor_codigo: null,
                        m2a_gestor_nome: null,
                        m2a_gestor_cpf: null,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a UG..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                        Nenhuma
                      </SelectItem>
                      {unidadesGestoras.map((unidade) => (
                        <SelectItem
                          key={unidade.id_local}
                          value={unidade.m2a_id}
                        >
                          {unidade.nome} - ID {unidade.m2a_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field("m2a_dot_orgao_id", "Órgão da Dotação")}
                {field("m2a_uo_id", "Unid. Orçamentária")}
                {field("m2a_dot_id", "Projeto/Atividade")}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {field("m2a_dotacao_default", "Dotação default")}
                {field("m2a_ref_coluna", "Ref. coluna na planilha", "number")}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ActorSelect
                  label="Fiscal padrão"
                  value={editing.m2a_fiscal_codigo || EMPTY_SELECT_VALUE}
                  servidores={rowFiscais}
                  emptyMessage="Nenhum fiscal mapeado para esta Unidade Gestora."
                  onChange={(value) => {
                    const fiscal = fiscais.find(
                      (item) => item.m2a_id === value,
                    );
                    setEditing((current) => ({
                      ...current,
                      m2a_fiscal_codigo: fiscal?.m2a_id ?? null,
                      m2a_fiscal_nome: fiscal?.nome ?? null,
                      m2a_fiscal_cpf: fiscal?.cpf ?? null,
                    }));
                  }}
                />
                <ActorSelect
                  label="Gestor padrão"
                  value={editing.m2a_gestor_codigo || EMPTY_SELECT_VALUE}
                  servidores={rowGestores}
                  emptyMessage="Nenhum gestor mapeado para esta Unidade Gestora."
                  onChange={(value) => {
                    const gestor = gestores.find(
                      (item) => item.m2a_id === value,
                    );
                    setEditing((current) => ({
                      ...current,
                      m2a_gestor_codigo: gestor?.m2a_id ?? null,
                      m2a_gestor_nome: gestor?.nome ?? null,
                      m2a_gestor_cpf: gestor?.cpf ?? null,
                    }));
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(value) => !value && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover secretaria/dotação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.nome}" será removida do cadastro. Essa ação não altera
              contratos já criados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ActorSelect({
  label,
  value,
  servidores,
  emptyMessage,
  onChange,
}: {
  label: string;
  value: string;
  servidores: M2AServidor[];
  emptyMessage: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
            Nenhum
          </SelectItem>
          {servidores.map((servidor) => (
            <SelectItem key={servidor.id_local} value={servidor.m2a_id}>
              {servidor.nome} - ID {servidor.m2a_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {servidores.length === 0 && (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
