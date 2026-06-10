import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { routeHead } from "@/lib/route-head";

export const Route = createFileRoute("/")({
  component: Index,
  head: () =>
    routeHead({
      path: "/",
      title: "Planeja IA — Contratações Públicas",
      description:
        "Sistema de planejamento e gestão de contratações públicas com apoio de IA para organizar demandas, itens, processos e contratos.",
    }),
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/dashboard" : "/login" });
  }, [user, loading, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Carregando...</div>
    </div>
  );
}
