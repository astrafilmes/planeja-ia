import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { formatNumber, formatBRL } from "@/lib/normalize";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

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

  const stats = [
    {
      label: "Processos",
      value: data?.processos ?? 0,
      icon: FileText,
      accent: "text-info",
    },
    {
      label: "Contratos",
      value: data?.contratos ?? 0,
      icon: FileSignature,
      accent: "text-primary",
    },
    {
      label: "Secretarias ativas",
      value: data?.secretarias ?? 0,
      icon: Building2,
      accent: "text-success",
    },
    {
      label: "Processamentos IRP",
      value: data?.jobs ?? 0,
      icon: FileSpreadsheet,
      accent: "text-warning",
    },
  ];

  return (
    <AppShell title="Dashboard" subtitle="Visão geral do setor de planejamento">
      <WorkflowGuide />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="border-slate-200 dark:border-slate-800"
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {s.label}
                  </div>
                  <div className="text-3xl font-semibold tracking-tight mt-1.5">
                    {formatNumber(s.value)}
                  </div>
                </div>
                <div
                  className={`size-9 rounded-md bg-muted grid place-items-center ${s.accent}`}
                >
                  <s.icon className="size-4.5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Contratos por
            secretaria (top 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="sigla" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
