import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  FileSignature,
  FileText,
  FileUp,
  Save,
  Send as SendIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { StickyActionBar } from "@/components/layout/StickyActionBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { routeHead } from "@/lib/utils/route-head";
import { useM2ASync } from "@/hooks/useM2ASync";

import {
  useContratoFlags,
  useDeleteContratos,
  useDownloadDocumentos,
  useEnviarContratosM2A,
  useItensConsolidados,
  useProcessoDetalhe,
  useProcessoForm,
  useProcessoSectionsNav,
} from "@/features/processo-detalhe/hooks";
import {
  ContratosVinculadosTab,
  EnviarM2ADialog,
  ItensConsolidadosTab,
  ProcessoErrorState,
  ProcessoHeader,
  ProcessoLoadingState,
  ProcessoVisaoGeralTab,
} from "@/features/processo-detalhe/components";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: Page,
  head: ({ params }) =>
    routeHead({
      path: `/processos/${params?.id ?? ""}`,
      title: `Processo ${params?.id ?? ""}`.trim(),
      description:
        "Detalhes do processo administrativo: itens, atas, fornecedores e situação atual no Planeja IA.",
      ogType: "article",
      noindex: true,
    }),
});

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error } = useProcessoDetalhe(id);
  const contratos = useMemo(() => data?.contratos ?? [], [data?.contratos]);
  const ataItens = useMemo(() => data?.ataItens ?? [], [data?.ataItens]);
  const processo = data?.processo ?? null;

  const { form, dirty, update, handleSave, handleDelete } = useProcessoForm(
    id,
    processo,
  );

  const { SECTIONS, activeSection } = useProcessoSectionsNav(processo?.id);

  const { sync: syncM2A, isSyncing } = useM2ASync({
    processoId: id,
    m2aProcessoUrl: form.m2a_url ?? processo?.m2a_url ?? null,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState("");

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleAll = useCallback(
    (checked: boolean, ids?: string[]) => {
      const pool = ids ?? contratos.map((c) => c.id);
      setSelected((prev) => {
        const n = new Set(prev);
        if (checked) for (const id of pool) n.add(id);
        else for (const id of pool) n.delete(id);
        return n;
      });
    },
    [contratos],
  );
  const toggleOne = useCallback((cid: string, checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(cid);
      else n.delete(cid);
      return n;
    });
  }, []);

  const { toggleImpresso, togglePublicado } = useContratoFlags(id);
  const deleteContratos = useDeleteContratos(id, clearSelection);
  const { handleDownloadContratoDocs, handleDownloadSelectedDocs } =
    useDownloadDocumentos(id);

  const m2a = useEnviarContratosM2A({
    processoId: id,
    processo,
    contratos,
    selected,
    clearSelection,
  });

  const itensConsolidados = useItensConsolidados(contratos, ataItens, itemSearch);

  const stats = useMemo(() => {
    let total = 0;
    let enviados = 0;
    for (const c of contratos) {
      total += c.valor_total;
      if (["enviado", "sucesso"].includes(c.status_envio_m2a)) enviados++;
    }
    return { total, enviados, totalContratos: contratos.length };
  }, [contratos]);

  const selectionStats = useMemo(() => {
    let total = 0;
    for (const c of contratos) if (selected.has(c.id)) total += c.valor_total;
    return { count: selected.size, total };
  }, [contratos, selected]);

  const handleDownloadSelected = useCallback(() => {
    handleDownloadSelectedDocs(m2a.selectedContracts);
  }, [handleDownloadSelectedDocs, m2a.selectedContracts]);

  const handleConfirmDeleteSelected = useCallback(() => {
    deleteContratos.mutate(Array.from(selected));
  }, [deleteContratos, selected]);

  if (isLoading) return <ProcessoLoadingState />;
  if (error || !processo) {
    return (
      <ProcessoErrorState
        error={error}
        onRetry={() =>
          qc.invalidateQueries({ queryKey: ["processo-detail", id] })
        }
      />
    );
  }

  return (
    <AppShell>
      <ProcessoHeader
        processo={processo}
        processoId={id}
        isSyncing={isSyncing}
        canSync={Boolean(form.m2a_url)}
        dirty={dirty}
        onSync={() => syncM2A()}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <WorkflowGuide
        steps={[
          {
            label: "Importar",
            description: "Origem do lote",
            to: "/importar-contratos",
            icon: FileUp,
            state: contratos.length ? "done" : "idle",
          },
          {
            label: "Processos",
            description: "Editar e sincronizar",
            to: "/processos",
            icon: FileText,
            state: "active",
          },
          {
            label: "Contratos",
            description: `${contratos.length} vinculado(s)`,
            to: "/contratos",
            icon: FileSignature,
            state: contratos.length ? "done" : "idle",
          },
          {
            label: "Enviar",
            description: "Automação do portal",
            to: "/contratos",
            icon: SendIcon,
          },
        ]}
      />

      <Tabs defaultValue="visao-geral" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="itens">
            Itens
            <Badge variant="secondary" className="ml-1">
              {itensConsolidados.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="contratos">
            Contratos
            <Badge variant="secondary" className="ml-1">
              {contratos.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <ProcessoVisaoGeralTab
            form={form}
            processo={processo}
            contratosCount={contratos.length}
            totalValor={stats.total}
            sections={SECTIONS}
            activeSection={activeSection}
            onChange={update}
          />
        </TabsContent>

        <TabsContent value="contratos">
          <ContratosVinculadosTab
            contratos={contratos}
            selected={selected}
            batchStatus={m2a.batchStatus}
            sending={m2a.sending}
            connected={m2a.connected}
            deletePending={deleteContratos.isPending}
            selectionStats={selectionStats}
            statsTotal={stats.total}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onDownloadSelected={handleDownloadSelected}
            onOpenSendDialog={() => m2a.setM2aDialogOpen(true)}
            onConfirmDeleteSelected={handleConfirmDeleteSelected}
            onDownloadContrato={handleDownloadContratoDocs}
            onToggleImpresso={toggleImpresso}
            onTogglePublicado={togglePublicado}
          />
        </TabsContent>

        <TabsContent value="itens">
          <ItensConsolidadosTab
            itens={itensConsolidados}
            search={itemSearch}
            onSearchChange={setItemSearch}
          />
        </TabsContent>
      </Tabs>

      {dirty && (
        <StickyActionBar
          status={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-amber-500"
                aria-hidden
              />
              Alterações não salvas
            </span>
          }
        >
          <Button size="sm" onClick={handleSave}>
            <Save className="size-4" /> Salvar alterações
          </Button>
        </StickyActionBar>
      )}

      <EnviarM2ADialog
        open={m2a.m2aDialogOpen}
        onOpenChange={m2a.setM2aDialogOpen}
        m2aContratoData={m2a.m2aContratoData}
        onDataChange={m2a.setM2aContratoData}
        m2aFiscalId={m2a.m2aFiscalId}
        onFiscalChange={m2a.setM2aFiscalId}
        shouldAskFiscal={m2a.shouldAskFiscal}
        filteredFiscais={m2a.filteredFiscais}
        selectedContracts={m2a.selectedContracts}
        selectedUnidadesCount={m2a.selectedUnidadeIds.length}
        selectionStats={selectionStats}
        sending={m2a.sending}
        connected={m2a.connected}
        onDiagnose={m2a.handleDiagnoseM2A}
        onConfirm={m2a.handleSendSelectedToM2A}
      />
    </AppShell>
  );
}
