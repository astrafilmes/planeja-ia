import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/route-head";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { useProgress } from "@/contexts/ProgressContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowUpCircle, Hash } from "lucide-react";
import { toast } from "sonner";
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
  sec?: Secretaria;
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
      // Otimização: Busca os dados com o JOIN já resolvido pelo Supabase
      const { data: numData, error } = await supabase
        .from("numeracao")
        .select(
          `
          *,
          sec:secretarias!inner(numero, nome, sigla)
        `,
        )
        .order("secretaria_num");

      if (error) throw error;
      return numData as unknown as NumeracaoComSec[];
    },
  });

  async function handleSync() {
    if (!data) return;
    const secretarias = data
      .filter((r: any) => r.sec?.sigla)
      .map((r: any) => ({ sigla: r.sec.sigla, num: r.secretaria_num }));
    if (secretarias.length === 0) {
      toast.error("Nenhuma secretaria com sigla disponível.");
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
            toast.error(`Erro na sincronização: ${ev.erro}`);
          } else {
            finishTask(
              `Sincronização concluída: ${ev.itens.length} secretaria(s).`,
            );
            toast.success(
              `Sincronização concluída (${ev.itens.length} secretarias).`,
            );
          }
        }
      });
    } catch (error: any) {
      setSyncing(false);
      failTask(error?.message ?? "Falha ao iniciar a sincronização.");
      toast.error("Falha ao iniciar a sincronização.", {
        description: error?.message,
      });
    }
  }

  async function ajustarPara(secNum: number, novoContador: number) {
    const atual = data?.find((r: any) => r.secretaria_num === secNum);
    if (!atual) return;
    const { error } = await supabase
      .from("numeracao")
      .update({ contador: novoContador, updated_at: new Date().toISOString() })
      .eq("secretaria_num", secNum);
    if (error) return toast.error(error.message);
    await supabase.from("audit_logs").insert({
      action: "numeracao_ajuste_m2a",
      entity_type: "numeracao",
      request_payload: {
        secretaria_num: secNum,
        antes: atual.contador,
        depois: novoContador,
      },
    });
    toast.success("Contador atualizado.");
    qc.invalidateQueries({ queryKey: ["numeracao"] });
  }

  async function ajustarTodos() {
    if (!data) return;
    const ajustes = data
      .map((r: any) => ({ r, m: m2aMap[r.sec?.sigla] }))
      .filter(
        (x: any) =>
          x.m?.ultimo_numero != null && x.m.ultimo_numero > x.r.contador,
      );
    if (ajustes.length === 0) {
      toast.info("Nenhum contador desatualizado.");
      return;
    }
    for (const { r, m } of ajustes) {
      await ajustarPara(r.secretaria_num, m.ultimo_numero!);
    }
  }

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
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 whitespace-nowrap">Nº</TableHead>
              <TableHead className="w-24 whitespace-nowrap">Sigla</TableHead>
              <TableHead>Secretaria</TableHead>
              <TableHead className="w-32 text-right whitespace-nowrap">
                Contador local
              </TableHead>
              <TableHead className="w-32 text-right whitespace-nowrap">
                Último no portal
              </TableHead>
              <TableHead className="w-24 text-right whitespace-nowrap">
                Diferença
              </TableHead>
              <TableHead className="w-40 text-right whitespace-nowrap">
                Próximo exemplo
              </TableHead>
              <TableHead className="w-28 text-right whitespace-nowrap">
                Ação
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-[13px] text-slate-500 dark:text-slate-400"
                >
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !data?.length && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={Hash}
                    title="Nenhum contador encontrado"
                    description="Cadastre secretarias para iniciar a numeração automática."
                  />
                </TableCell>
              </TableRow>
            )}
            {data?.map((r: any) => {
              const m = r.sec?.sigla ? m2aMap[r.sec.sigla] : undefined;
              const diff =
                m?.ultimo_numero != null ? m.ultimo_numero - r.contador : null;
              const desatualizado = diff != null && diff > 0;
              return (
                <TableRow key={r.secretaria_num}>
                  <TableCell className="font-mono text-sm">
                    {r.secretaria_num}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {r.sec?.sigla ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-sm truncate max-w-xs"
                    title={r.sec?.nome}
                  >
                    {r.sec?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {r.contador}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {m?.erro ? (
                      <span className="text-destructive" title={m.erro}>
                        erro
                      </span>
                    ) : m?.ultimo_numero != null ? (
                      m.ultimo_numero
                    ) : m ? (
                      "—"
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {diff == null ? (
                      "—"
                    ) : desatualizado ? (
                      <Badge variant="destructive">+{diff}</Badge>
                    ) : (
                      <Badge variant="outline">ok</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                    NNN/{new Date().getFullYear()}
                    {r.sec?.sigla ?? ""}
                    {String(r.contador + 1).padStart(2, "0")}
                  </TableCell>
                  <TableCell className="text-right">
                    {desatualizado && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          ajustarPara(r.secretaria_num, m!.ultimo_numero!)
                        }
                      >
                        Ajustar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
