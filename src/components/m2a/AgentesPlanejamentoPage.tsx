import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import {
  sincronizarUnidadesOrcamentarias,
  sincronizarAgentesPlanejamentoUO,
} from "@/lib/m2a-catalogos";

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function AgentesPlanejamentoPage() {
  const qc = useQueryClient();
  const [dataRef, setDataRef] = useState(todayISO());
  const [syncingUO, setSyncingUO] = useState(false);
  const [syncingAg, setSyncingAg] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data: orgaos = [] } = useQuery({
    queryKey: ["m2a-orgaos-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_gestoras")
        .select("m2a_id, nome")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["m2a-uos-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_orcamentarias")
        .select("m2a_id, nome, orgao_m2a_id")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ["m2a-agentes-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_agentes_planejamento")
        .select("unidade_m2a_id, servidor_m2a_id, nome, data_referencia, ativo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgaoByM2a = new Map(orgaos.map((o) => [o.m2a_id, o.nome]));
  const agentesByUO = new Map<string, typeof agentes>();
  for (const a of agentes) {
    if (!a.ativo) continue;
    const arr = agentesByUO.get(a.unidade_m2a_id) ?? [];
    arr.push(a);
    agentesByUO.set(a.unidade_m2a_id, arr);
  }

  // Linhas: todos órgãos + suas UOs. Se órgão sem UO cadastrada → linha 1:1.
  const rows: Array<{
    uoPk: string;
    uoNome: string;
    orgaoNome: string;
    isFallback: boolean;
  }> = [];
  for (const o of orgaos) {
    const filhas = unidades.filter((u) => u.orgao_m2a_id === o.m2a_id);
    if (filhas.length === 0) {
      rows.push({
        uoPk: o.m2a_id,
        uoNome: o.nome,
        orgaoNome: o.nome,
        isFallback: true,
      });
    } else {
      for (const u of filhas) {
        rows.push({
          uoPk: u.m2a_id,
          uoNome: u.nome,
          orgaoNome: o.nome,
          isFallback: false,
        });
      }
    }
  }
  // UOs órfãs (sem órgão)
  for (const u of unidades) {
    if (!u.orgao_m2a_id || !orgaoByM2a.has(u.orgao_m2a_id)) {
      if (!rows.find((r) => r.uoPk === u.m2a_id)) {
        rows.push({
          uoPk: u.m2a_id,
          uoNome: u.nome,
          orgaoNome: "(sem órgão)",
          isFallback: false,
        });
      }
    }
  }

  async function handleSyncUOs() {
    setSyncingUO(true);
    try {
      const r = await sincronizarUnidadesOrcamentarias();
      toast.success("UOs sincronizadas", {
        description: `${r.orgaos} órgãos, ${r.unidades} unidades${r.unidades_sem_orgao ? ` (${r.unidades_sem_orgao} sem órgão pai)` : ""}.`,
      });
      qc.invalidateQueries({ queryKey: ["m2a-uos-page"] });
      qc.invalidateQueries({ queryKey: ["m2a-orgaos-page"] });
    } catch (e: any) {
      toast.error("Falha ao sincronizar UOs", { description: e?.message });
    } finally {
      setSyncingUO(false);
    }
  }

  async function handleSyncAgentes(uoPk: string) {
    setSyncingAg(uoPk);
    try {
      const n = await sincronizarAgentesPlanejamentoUO(uoPk, dataRef);
      toast.success(`${n} agente(s) sincronizado(s)`);
      qc.invalidateQueries({ queryKey: ["m2a-agentes-page"] });
    } catch (e: any) {
      toast.error("Falha ao sincronizar agentes", { description: e?.message });
    } finally {
      setSyncingAg(null);
    }
  }

  async function handleSyncAllAgentes() {
    setSyncingAll(true);
    let ok = 0;
    let err = 0;
    for (const r of rows) {
      try {
        await sincronizarAgentesPlanejamentoUO(r.uoPk, dataRef);
        ok++;
      } catch {
        err++;
      }
    }
    qc.invalidateQueries({ queryKey: ["m2a-agentes-page"] });
    setSyncingAll(false);
    toast.success(`Sincronização concluída`, {
      description: `${ok} UO(s) ok${err ? `, ${err} com erro` : ""}.`,
    });
  }

  return (
    <AppShell
      title="Agentes de Planejamento"
      subtitle="Catálogo de agentes de planejamento por unidade orçamentária"
    >
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              Sincronização
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Data de referência</Label>
              <Input
                type="date"
                value={dataRef}
                onChange={(e) => setDataRef(e.target.value)}
                className="w-48"
              />
            </div>
            <Button onClick={handleSyncUOs} disabled={syncingUO} variant="outline">
              {syncingUO ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sincronizar UOs
            </Button>
            <Button onClick={handleSyncAllAgentes} disabled={syncingAll || rows.length === 0}>
              {syncingAll ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sincronizar agentes (todas UOs)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Unidades orçamentárias e agentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Órgão</TableHead>
                  <TableHead>Unidade orçamentária</TableHead>
                  <TableHead>Agente(s) cadastrado(s)</TableHead>
                  <TableHead className="w-40">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      Nenhuma UO encontrada. Clique em "Sincronizar UOs".
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const list = agentesByUO.get(r.uoPk) ?? [];
                  return (
                    <TableRow key={r.uoPk}>
                      <TableCell className="text-sm">
                        {r.orgaoNome.replace(/^\s*\[[^\]]+\]\s*/, "")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.uoNome.replace(/^\s*\[[^\]]+\]\s*/, "")}
                        {r.isFallback && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            (sem UO filha — usa o próprio órgão)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {list.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          list.map((a) => a.nome).join(", ")
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSyncAgentes(r.uoPk)}
                          disabled={syncingAg === r.uoPk}
                        >
                          {syncingAg === r.uoPk ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          Sincronizar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
