import { createFileRoute, Link } from "@tanstack/react-router";
import { routeHead } from "@/lib/utils/route-head";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  FileSignature,
  Building2,
  FileSpreadsheet,
  TrendingUp,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { formatNumber } from "@/lib/utils/normalize";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { HeroCard } from "@/components/dashboard/HeroCard";
import { BentoKPI } from "@/components/dashboard/BentoKPI";
import { AgendaPanel, AgendaItem } from "@/components/dashboard/AgendaPanel";
import { ChartCard, ChartTooltip } from "@/components/dashboard/ChartCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () =>
    routeHead({
      path: "/dashboard",
      title: "Dashboard",
      description:
        "Visão geral do setor de planejamento: processos, contratos, secretarias e indicadores de contratações públicas.",
    }),
});

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-v2"],
    queryFn: async () => {
      const [p, c, s, j, contractsBySec, recentContratos, recentJobs] =
        await Promise.all([
          supabase
            .from("processos")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null),
          supabase
            .from("contratos")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null),
          supabase
            .from("secretarias")
            .select("id", { count: "exact", head: true })
            .eq("ativa", true),
          supabase.from("irp_jobs").select("id", { count: "exact", head: true }),
          supabase
            .from("contratos")
            .select("secretaria_sigla")
            .is("deleted_at", null),
          supabase
            .from("contratos")
            .select("id, numero_contrato, secretaria_sigla, created_at, publicado")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(4),
          supabase
            .from("irp_jobs")
            .select("id, original_filename, status, created_at")
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      const byS: Record<string, number> = {};
      (contractsBySec.data ?? []).forEach((r: any) => {
        byS[r.secretaria_sigla] = (byS[r.secretaria_sigla] ?? 0) + 1;
      });

      return {
        processos: p.count ?? 0,
        contratos: c.count ?? 0,
        secretarias: s.count ?? 0,
        jobs: j.count ?? 0,
        chart: Object.entries(byS)
          .map(([sigla, total]) => ({ sigla, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10),
        recentContratos: recentContratos.data ?? [],
        recentJobs: recentJobs.data ?? [],
      };
    },
  });

  const chartData = data?.chart ?? [];

  // Build timeline items from real activity
  const agendaItems: AgendaItem[] = [
    ...((data?.recentContratos ?? []) as any[]).map((c) => ({
      id: `c-${c.id}`,
      icon: <FileSignature className="size-4" aria-hidden="true" />,
      title: `Contrato ${c.numero_contrato || "s/n"}`,
      subtitle: `${c.secretaria_sigla || "—"} · ${c.publicado ? "publicado" : "rascunho"}`,
      time: relativeTime(c.created_at),
      tone: c.publicado ? ("teal" as const) : ("slate" as const),
    })),
    ...((data?.recentJobs ?? []) as any[]).map((j) => ({
      id: `j-${j.id}`,
      icon:
        j.status === "completed" ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : j.status === "failed" ? (
          <AlertTriangle className="size-4" aria-hidden="true" />
        ) : (
          <Activity className="size-4" aria-hidden="true" />
        ),
      title: j.original_filename || "Job IRP",
      subtitle: `Importação · ${j.status || "—"}`,
      time: relativeTime(j.created_at),
      tone:
        j.status === "failed"
          ? ("rose" as const)
          : j.status === "completed"
            ? ("teal" as const)
            : ("amber" as const),
    })),
  ].slice(0, 6);

  const markedDates = (data?.recentContratos ?? [])
    .map((c: any) => (c.created_at ? c.created_at.slice(0, 10) : null))
    .filter(Boolean) as string[];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {/* Hero */}
        <HeroCard
          eyebrow="Painel Planeja"
          title={
            <>
              Acompanhe processos,{" "}
              <span className="text-brand-panel-foreground/60">contratos</span> e atas{" "}
              <span className="text-brand-panel-foreground/60">em um só lugar.</span>
            </>
          }
          description="Sincronize com o M2A, gere pautas consolidadas e mantenha as secretarias sempre atualizadas — sem retrabalho."
          cta="Ir para processos"
          onCtaClick={() => {
            window.location.href = "/processos";
          }}
        />

        {/* Main split: content + agenda */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">
            {/* Editorial header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">
                  Visão geral
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Indicadores e atividade recente do setor de planejamento
                </p>
              </div>
              <Link
                to="/contratos"
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[12px] font-medium text-accent-strong transition-colors hover:bg-accent/15"
              >
                Gerenciar
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/* Bento KPI grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-32 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <BentoKPI
                  label="Processos"
                  value={formatNumber(data?.processos ?? 0)}
                  hint="Ativos no banco"
                  icon={<FileText className="size-4" aria-hidden="true" />}
                />
                <BentoKPI
                  label="Contratos"
                  value={formatNumber(data?.contratos ?? 0)}
                  hint="Vigentes (não arquivados)"
                  variant="accent"
                  icon={
                    <FileSignature className="size-4" aria-hidden="true" />
                  }
                />
                <BentoKPI
                  label="Secretarias"
                  value={formatNumber(data?.secretarias ?? 0)}
                  hint="Ativas"
                  icon={<Building2 className="size-4" aria-hidden="true" />}
                />
                <BentoKPI
                  label="IRP jobs"
                  value={formatNumber(data?.jobs ?? 0)}
                  hint="Histórico de importações"
                  variant="dark"
                  icon={
                    <FileSpreadsheet className="size-4" aria-hidden="true" />
                  }
                />
              </div>
            )}

            {/* Chart */}
            <ChartCard
              title="Contratos por secretaria"
              description="Top 10 secretarias com mais contratos ativos"
              icon={
                <TrendingUp className="size-4 text-accent" aria-hidden="true" />
              }
              loading={isLoading}
              isEmpty={!isLoading && chartData.length === 0}
              empty={
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <BarChart3 className="size-8 opacity-40" aria-hidden="true" />
                  <p className="text-[13px]">Nenhum contrato cadastrado ainda.</p>
                </div>
              }
              action={
                <Link
                  to="/contratos"
                  className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11.5px] font-medium text-accent-strong transition-colors hover:bg-accent/15"
                >
                  Ver tudo
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity={0.45}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="sigla"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={
                      <ChartTooltip valueFormatter={(v) => `${v} contratos`} />
                    }
                  />
                  <Bar
                    dataKey="total"
                    name="Contratos"
                    fill="url(#barFill)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={42}
                    animationDuration={650}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Guia rápido — compact, full width */}
            <Card variant="elevated" className="rounded-lg border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px]">Guia rápido</CardTitle>
                <p className="text-[12px] text-muted-foreground">
                  Próximos passos sugeridos pelo sistema
                </p>
              </CardHeader>
              <CardContent>
                <WorkflowGuide compact />
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN — agenda */}
          <AgendaPanel
            items={agendaItems}
            markedDates={markedDates}
            loading={isLoading}
          />
        </div>
      </div>
    </AppShell>
  );
}
