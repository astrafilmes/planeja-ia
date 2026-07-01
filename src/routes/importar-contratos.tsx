import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { routeHead } from "@/lib/utils/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileSignature,
  FileText,
  Loader2,
  Send,
  Upload,
} from "lucide-react";
import {
  useAutorizarGeracao,
  useContratosDerivados,
  useDeleteImportJob,
  useImportarPlanilha,
  useImportQueries,
  useItemMutations,
  usePrepostosState,
} from "@/features/importar-contratos/hooks";
import {
  AutorizarGeracaoPanel,
  ContratosPreviewList,
  HistoricoJobsSidebar,
  ImportSummaryBar,
  ItensReviewTable,
  UploadCard,
} from "@/features/importar-contratos/components";

export const Route = createFileRoute("/importar-contratos")({
  component: Page,
  head: () =>
    routeHead({
      path: "/importar-contratos",
      title: "Importar contratos",
      description:
        "Importe contratos a partir de planilhas e documentos, com validação assistida por IA.",
      noindex: true,
    }),
});

function Page() {
  /* --------------------------- Estado local da página --------------------------- */
  const [file, setFile] = useState<File | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [m2aProcessoUrl, setM2aProcessoUrl] = useState("");
  const [numeroProcessoBase, setNumeroProcessoBase] = useState("");
  const [processoId, setProcessoId] = useState<string>("");
  const [objetoBatch, setObjetoBatch] = useState("");
  const [dataBatch, setDataBatch] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [criarProcesso, setCriarProcesso] = useState(true);
  const [contratosDesmarcados, setContratosDesmarcados] = useState<Set<string>>(
    new Set(),
  );

  /* -------------------------------- Queries -------------------------------- */
  const queries = useImportQueries({ activeJobId });
  const {
    processos,
    secretarias: secretariasM2A,
    fornecedoresPrepostos,
    jobs,
    jobDetail,
    detailFetching,
    m2aAtas,
    m2aItens,
  } = queries;

  /* ------------------------------ Dados derivados ------------------------------ */
  const derived = useContratosDerivados({
    jobDetail,
    secretariasM2A,
    contratosDesmarcados,
    setContratosDesmarcados,
  });
  const {
    contratosPreliminares,
    contratosSelecionados,
    fornecedoresPrepostoTargets,
    contratosSemCadastroM2A,
    contratosSemAtaM2A,
    totalValor,
    totalItens,
    fornecedoresUnicos,
    itensSemValor,
    isAutorizado,
  } = derived;

  const prepostos = usePrepostosState({
    fornecedoresPrepostoTargets,
    fornecedoresPrepostos,
  });
  const {
    prepostosByFornecedor,
    setPrepostosByFornecedor,
    fornecedorMapFromDb,
    fornecedoresSemPreposto,
  } = prepostos;

  /* -------------------------------- Actions -------------------------------- */
  const importar = useImportarPlanilha({
    secretarias: secretariasM2A,
    setActiveJobId,
    setFile,
    setM2aProcessoUrl,
  });
  const { busy, setBusy, handleImportar } = importar;

  const { autorizarGeracao } = useAutorizarGeracao({
    jobDetail,
    activeJobId,
    contratosSelecionados,
    contratosSemAtaM2A,
    contratosSemCadastroM2A,
    contratosDesmarcados,
    fornecedoresPrepostoTargets,
    fornecedoresSemPreposto,
    prepostosByFornecedor,
    secretariasM2A,
    m2aItens,
    numeroProcessoBase,
    objetoBatch,
    dataBatch,
    criarProcesso,
    processoId,
    setBusy,
  });

  const { atualizarItem, atualizarAtaItem, alternarDotacao } = useItemMutations({
    activeJobId,
    m2aAtas,
    m2aItens,
  });

  const { excluirJob } = useDeleteImportJob({ activeJobId, setActiveJobId });

  /* --------------------- Efeitos de UI (não relacionados a IO) --------------------- */

  // Auto-preenche Nº base e Objeto quando um processo existente é vinculado.
  useEffect(() => {
    if (!processoId) return;
    const p = processos.find((x) => x.id === processoId);
    if (!p) return;
    if (p.numero_processo) setNumeroProcessoBase(p.numero_processo);
    if (p.objeto) setObjetoBatch(p.objeto);
  }, [processoId, processos]);

  // Reset desmarcações ao trocar de job
  useEffect(() => {
    setContratosDesmarcados(new Set());
  }, [activeJobId]);

  /* ------------------------------- Handlers ------------------------------- */
  const toggleContratoDesmarcado = useCallback((key: string) => {
    setContratosDesmarcados((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onSubmitImport = useCallback(
    () => handleImportar(file, m2aProcessoUrl),
    [handleImportar, file, m2aProcessoUrl],
  );

  const onChangePreposto = useCallback(
    (key: string, value: string) =>
      setPrepostosByFornecedor((current) => ({ ...current, [key]: value })),
    [setPrepostosByFornecedor],
  );

  /* --------------------------------- Render --------------------------------- */
  return (
    <AppShell
      title="Importar contratos"
      subtitle="Upload da planilha, revisão e geração em lote"
    >
      <WorkflowGuide
        title="Fluxo da importação"
        steps={[
          {
            label: "Importar",
            description: "Planilha e processo no portal",
            to: "/importar-contratos",
            icon: Upload,
            state: "active",
          },
          {
            label: "Processos",
            description: "Snapshot de atas",
            to: "/processos",
            icon: FileText,
          },
          {
            label: "Contratos",
            description: "Gerar lote",
            to: "/contratos",
            icon: FileSignature,
          },
          {
            label: "Enviar",
            description: "Portal e documentos",
            to: "/contratos",
            icon: Send,
          },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* Sidebar: upload + histórico */}
        <div className="flex flex-col gap-4">
          <UploadCard
            file={file}
            onFileChange={setFile}
            m2aProcessoUrl={m2aProcessoUrl}
            onM2aProcessoUrlChange={setM2aProcessoUrl}
            busy={busy}
            onSubmit={onSubmitImport}
          />
          <HistoricoJobsSidebar
            jobs={jobs}
            activeJobId={activeJobId}
            onSelectJob={setActiveJobId}
            onDeleteJob={excluirJob}
          />
        </div>

        {/* Principal: revisão */}
        <div className="min-w-0">
          {!activeJobId && (
            <Card className="border-dashed border-border/60">
              <EmptyState
                icon={Upload}
                title="Selecione uma importação"
                description="Escolha um registro recente ou envie uma nova planilha."
              />
            </Card>
          )}

          {activeJobId && detailFetching && !jobDetail && (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center text-[13px] text-muted-foreground">
                <Loader2 className="mr-2 inline size-5 animate-spin" />
                Carregando...
              </CardContent>
            </Card>
          )}

          {jobDetail && (
            <div className="flex flex-col gap-4">
              <ImportSummaryBar
                fornecedoresUnicos={fornecedoresUnicos}
                fallbackEmpresa={jobDetail.job.empresa}
                itensValidosCount={
                  (jobDetail.itens ?? []).filter((i: any) => !i.excluido).length
                }
                contratosSelecionadosCount={contratosSelecionados.length}
                contratosPreliminaresCount={contratosPreliminares.length}
                contratosDesmarcadosCount={contratosDesmarcados.size}
                totalValor={totalValor}
                itensSemValor={itensSemValor}
              />

              <Tabs defaultValue="contratos">
                <TabsList>
                  <TabsTrigger value="contratos">
                    Contratos previstos ({contratosPreliminares.length})
                  </TabsTrigger>
                  <TabsTrigger value="itens">
                    Itens da planilha ({jobDetail.itens.length})
                  </TabsTrigger>
                  <TabsTrigger value="autorizar">Autorizar geração</TabsTrigger>
                </TabsList>

                <TabsContent value="contratos" className="mt-3">
                  <ContratosPreviewList
                    contratosPreliminares={contratosPreliminares}
                    secretariasM2A={secretariasM2A}
                    prepostosByFornecedor={prepostosByFornecedor}
                    contratosDesmarcados={contratosDesmarcados}
                    isAutorizado={isAutorizado}
                    onToggleContrato={toggleContratoDesmarcado}
                  />
                </TabsContent>

                <TabsContent value="itens" className="mt-3">
                  <ItensReviewTable
                    itens={jobDetail.itens}
                    dotacoes={jobDetail.dotacoes}
                    m2aAtas={m2aAtas}
                    isAutorizado={isAutorizado}
                    onAtualizarItem={atualizarItem}
                    onAtualizarAtaItem={atualizarAtaItem}
                    onAlternarDotacao={alternarDotacao}
                  />
                </TabsContent>

                <TabsContent value="autorizar" className="mt-3">
                  <AutorizarGeracaoPanel
                    isAutorizado={isAutorizado}
                    contratosPreliminaresCount={contratosPreliminares.length}
                    contratosSelecionados={contratosSelecionados}
                    contratosSemAtaM2A={contratosSemAtaM2A}
                    contratosSemCadastroM2A={contratosSemCadastroM2A}
                    contratosDesmarcados={contratosDesmarcados}
                    fornecedoresPrepostoTargets={fornecedoresPrepostoTargets}
                    fornecedoresSemPreposto={fornecedoresSemPreposto}
                    fornecedorMapFromDb={fornecedorMapFromDb}
                    prepostosByFornecedor={prepostosByFornecedor}
                    onChangePreposto={onChangePreposto}
                    processos={processos}
                    processoId={processoId}
                    onChangeProcessoId={setProcessoId}
                    criarProcesso={criarProcesso}
                    onChangeCriarProcesso={setCriarProcesso}
                    numeroProcessoBase={numeroProcessoBase}
                    onChangeNumeroProcessoBase={setNumeroProcessoBase}
                    dataBatch={dataBatch}
                    onChangeDataBatch={setDataBatch}
                    objetoBatch={objetoBatch}
                    onChangeObjetoBatch={setObjetoBatch}
                    totalValor={totalValor}
                    totalItens={totalItens}
                    busy={busy}
                    onAutorizar={autorizarGeracao}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
