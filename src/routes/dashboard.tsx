import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/route-head";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  FileSignature,
  Building2,
  FileSpreadsheet,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { formatNumber } from "@/lib/normalize";
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
import { StatChip } from "@/components/dashboard/StatChip";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () =>
    routeHead({
      path: "/dashboard",
      title: "Dashboard",
      description:
        "Visão geral do setor de planejamento: processos, contratos, secretarias e indicadores de contratações públicas.",
    }),
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [p, c, s, j, contractsBySec] = await Promise.all([
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
          .select("secretaria_sigla, secretaria_num")
          .is("deleted_at", null),
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
      };
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <HeroCard
          eyebrow="Painel Planeja"
          title={
            <>
              Acompanhe processos,{" "}
              <span className="text-white/70">contratos</span> e atas{" "}
              <span className="text-white/70">em um só lugar.</span>
            </>
          }
          description="Sincronize com o M2A, gere pautas consolidadas e mantenha as secretarias sempre atualizadas — sem retrabalho."
          cta="Ir para processos"
          onCtaClick={() => {
            window.location.href = "/processos";
          }}
          illustration={
            <div className="relative flex h-32 w-56 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
              <Sparkles className="size-14 text-white/80" strokeWidth={1.2} />
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatChip
            tone="indigo"
            label="Processos ativos"
            value={formatNumber(data?.processos ?? 0)}
            icon={<FileText className="size-5" />}
            hint="Total no banco"
          />
          <StatChip
            tone="pink"
            label="Contratos vigentes"
            value={formatNumber(data?.contratos ?? 0)}
            icon={<FileSignature className="size-5" />}
            hint="Excluindo arquivados"
          />
          <StatChip
            tone="green"
            label="Secretarias ativas"
            value={formatNumber(data?.secretarias ?? 0)}
            icon={<Building2 className="size-5" />}
          />
          <StatChip
            tone="amber"
            label="Processamentos IRP"
            value={formatNumber(data?.jobs ?? 0)}
            icon={<FileSpreadsheet className="size-5" />}
            hint="Histórico"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <TrendingUp className="size-4 text-accent" /> Contratos por
                  secretaria
                </CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Top 10 secretarias com mais contratos ativos
                </p>
              </div>
              <Link
                to="/contratos"
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11.5px] font-medium text-accent-strong transition-colors hover:bg-accent/15"
              >
                Ver tudo
                <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.chart ?? []}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" />
                        <stop
                          offset="100%"
                          stopColor="var(--accent)"
                          stopOpacity={0.55}
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
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                        boxShadow: "var(--shadow-elevated)",
                      }}
                    />
                    <Bar
                      dataKey="total"
                      fill="url(#barFill)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px]">Guia rápido</CardTitle>
              <p className="text-[12px] text-muted-foreground">
                Próximos passos sugeridos pelo sistema
              </p>
            </CardHeader>
            <CardContent>
              <WorkflowGuide />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
