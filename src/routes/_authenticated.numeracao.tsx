import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/utils/route-head";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { useProgress } from "@/contexts/ProgressContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RefreshCw, ArrowUpCircle, Hash } from "lucide-react";
import { notify } from "@/lib/notify";
import {
  requestNumeracaoSync,
  listenNumeracaoSync,
  type M2ASyncItemResult,
} from "@/lib/m2a";

interface Secretaria {
  numero: number;
  nome: string;
  sigla: string;
}

interface NumeracaoComSec {
  secretaria_num: number;
  contador: number;
  updated_at: string;
  sec?: Secretaria | null;
}

export const Route = createFileRoute("/numeracao")({
  component: Page,
  head: () =>
    routeHead({
      path: "/numeracao",
      title: "Numeração",
      description:
        "Configure e acompanhe a numeração sequencial de processos e contratos administrativos.",
      noindex: true,
    }),
});

function Page() {
  const qc = useQueryClient();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const [syncing, setSyncing] = useState(false);
  const [m2aMap, setM2aMap] = useState<Record<string, M2ASyncItemResult>>({});

  const { data, isLoading } = useQuery<NumeracaoComSec[]>({
    queryKey: ["numeracao"],
    queryFn: async () => {
      const [{ data: numData, error: numErr }, { data: secData, error: secErr }] =
        await Promise.all([
          supabase.from("numeracao").select("*").order("secretaria_num"),
          supabase.from("secretarias").select("numero, nome, sigla"),
        ]);
      if (numErr) throw numErr;
      if (secErr) throw secErr;
      const secByNum = new Map(
        (secData ?? []).map((s: any) => [Number(s.numero), s]),
      );
      return (numData ?? []).map((n: any) => ({
        ...n,
        sec: secByNum.get(Number(n.secretaria_num)) ?? null,
      })) as unknown as NumeracaoComSec[];
    },
  });

  async function handleSync() {
    if (!data) return;
    const secretarias = data
      .filter((r) => r.sec?.sigla)
      .map((r) => ({ sigla: r.sec!.sigla, num: r.secretaria_num }));
    if (secretarias.length === 0) {
      notify.error("Nenhuma secretaria com sigla disponível.");
      return;
    }
    setSyncing(true);
    setM2aMap({});
    startTask(
      "Sincronizando numeração",
      `Consultando ${secretarias.length} secretaria(s) no portal...`,
    );
    const ano = new Date().getFullYear();
    try {
      const requestId = requestNumeracaoSync(secretarias, ano);
      const off = listenNumeracaoSync(requestId, (ev) => {
        if (ev.type === "M2A_SYNC_PROGRESS") {
          setM2aMap((m) => {
            const next = { ...m, [ev.sigla]: ev.resultado };
            const current = Object.keys(next).length;
            updateProgress(
              (current / secretarias.length) * 100,
              `Sincronizando ${current} de ${secretarias.length} secretaria(s)...`,
            );
            return next;
          });
        } else {
          setM2aMap((m) => {
            const next = { ...m };
            for (const it of ev.itens) next[it.sigla] = it;
            return next;
          });
          setSyncing(false);
          off();
          if (ev.erro) {
            failTask(`Erro na sincronização: ${ev.erro}`);
            notify.error(`Erro na sincronização: ${ev.erro}`);
          } else {
            finishTask(
              `Sincronização concluída: ${ev.itens.length} secretaria(s).`,
            );
            notify.success(
              `Sincronização concluída (${ev.itens.length} secretarias).`,
            );
          }
        }
      });
    } catch (error: any) {
      setSyncing(false);
      failTask(error?.message ?? "Falha ao iniciar a sincronização.");
      notify.error("Falha ao iniciar a sincronização.", {
        description: error?.message,
      });
    }
  }

  async function ajustarPara(secNum: number, novoContador: number) {
    const atual = data?.find((r) => r.secretaria_num === secNum);
    if (!atual) return;
    const { error } = await supabase
      .from("numeracao")
      .update({ contador: novoContador, updated_at: new Date().toISOString() })
      .eq("secretaria_num", secNum);
    if (error) return notify.error(error.message);
    await supabase.from("audit_logs").insert({
      action: "numeracao_ajuste_m2a",
      entity_type: "numeracao",
      request_payload: {
        secretaria_num: secNum,
        antes: atual.contador,
        depois: novoContador,
      },
    });
    notify.success("Contador atualizado.");
    qc.invalidateQueries({ queryKey: ["numeracao"] });
  }

  async function ajustarTodos() {
    if (!data) return;
    const ajustes = data
      .map((r) => ({ r, m: r.sec?.sigla ? m2aMap[r.sec.sigla] : undefined }))
      .filter(
        (x) =>
          x.m?.ultimo_numero != null && x.m.ultimo_numero > x.r.contador,
      );
    if (ajustes.length === 0) {
      notify.info("Nenhum contador desatualizado.");
      return;
    }
    for (const { r, m } of ajustes) {
      await ajustarPara(r.secretaria_num, m!.ultimo_numero!);
    }
  }

  const columns: DataTableColumn<NumeracaoComSec>[] = [
    {
      id: "num",
      header: "Nº",
      width: "w-16",
      cell: (r) => <span className="font-mono text-sm">{r.secretaria_num}</span>,
      sortable: true,
      sortAccessor: (r) => r.secretaria_num,
    },
    {
      id: "sigla",
      header: "Sigla",
      width: "w-24",
      cell: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.sec?.sigla ?? "—"}
        </Badge>
      ),
    },
    {
      id: "nome",
      header: "Secretaria",
      cell: (r) => (
        <span className="block max-w-xs truncate text-sm" title={r.sec?.nome}>
          {r.sec?.nome ?? "—"}
        </span>
      ),
      sortable: true,
      sortAccessor: (r) => r.sec?.nome ?? "",
    },
    {
      id: "contador",
      header: "Contador local",
      align: "right",
      width: "w-32",
      cell: (r) => <span className="font-mono text-sm font-semibold">{r.contador}</span>,
      sortable: true,
      sortAccessor: (r) => r.contador,
    },
    {
      id: "portal",
      header: "Último no portal",
      align: "right",
      width: "w-32",
      cell: (r) => {
        const m = r.sec?.sigla ? m2aMap[r.sec.sigla] : undefined;
        if (m?.erro)
          return (
            <span className="font-mono text-sm text-destructive" title={m.erro}>
              erro
            </span>
          );
        if (m?.ultimo_numero != null)
          return <span className="font-mono text-sm">{m.ultimo_numero}</span>;
        return <span className="font-mono text-sm text-muted-foreground">—</span>;
      },
    },
    {
      id: "diff",
      header: "Diferença",
      align: "right",
      width: "w-24",
      cell: (r) => {
        const m = r.sec?.sigla ? m2aMap[r.sec.sigla] : undefined;
        const diff = m?.ultimo_numero != null ? m.ultimo_numero - r.contador : null;
        if (diff == null) return "—";
        return diff > 0 ? (
          <Badge variant="destructive">+{diff}</Badge>
        ) : (
          <Badge variant="outline">ok</Badge>
        );
      },
    },
    {
      id: "exemplo",
      header: "Próximo exemplo",
      align: "right",
      width: "w-40",
      cell: (r) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          NNN/{new Date().getFullYear()}
          {r.sec?.sigla ?? ""}
          {String(r.contador + 1).padStart(2, "0")}
        </span>
      ),
    },
  ];

  return (
    <AppShell
      title="Numeração"
      subtitle="Contadores automáticos por secretaria"
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={ajustarTodos}
            disabled={syncing || Object.keys(m2aMap).length === 0}
          >
            <ArrowUpCircle className="size-4" /> Ajustar todos
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar com portal"}
          </Button>
        </div>
      }
    >
      <DataTable<NumeracaoComSec>
        data={data ?? []}
        columns={columns}
        getRowId={(r) => String(r.secretaria_num)}
        isLoading={isLoading}
        actionsHeader="Ação"
        emptyState={
          <EmptyState
            icon={Hash}
            title="Nenhum contador encontrado"
            description="Cadastre secretarias para iniciar a numeração automática."
          />
        }
        rowActions={(r) => {
          const m = r.sec?.sigla ? m2aMap[r.sec.sigla] : undefined;
          const diff = m?.ultimo_numero != null ? m.ultimo_numero - r.contador : null;
          if (diff == null || diff <= 0) return null;
          return (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => ajustarPara(r.secretaria_num, m!.ultimo_numero!)}
            >
              Ajustar
            </Button>
          );
        }}
      />
    </AppShell>
  );
}
