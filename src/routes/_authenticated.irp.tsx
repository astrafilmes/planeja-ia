import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Clock, FileSpreadsheet, Upload } from "lucide-react";
import { routeHead } from "@/lib/utils/route-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/layout/EmptyState";
import { IrpCabecalhoCard } from "@/components/irp/IrpCabecalhoCard";
import { IrpConfirmacaoProcessoModal } from "@/components/irp/IrpConfirmacaoProcessoModal";
import {
  buildDefaultProcessoM2AForm,
  type ProcessoM2AForm,
} from "@/features/irp/lib";
import {
  useEnviarProcessoM2A,
  useIrpDetalhe,
  useIrpDownloads,
  useIrpImportRows,
  useIrpJobsList,
  useIrpSecretariasM2A,
  useIrpUnidades,
  useIrpUploadAnalise,
} from "@/features/irp/hooks";
import {
  IrpAnaliseSummary,
  IrpBulkActionsBar,
  IrpHeader,
  IrpJobsHistorySidebar,
  IrpProcessoM2AProgress,
  IrpResultadoSalvoCard,
  IrpSecretariasTable,
  IrpUploadCard,
  IrpWorkflowGuide,
  type IrpSecretariaTableRow,
} from "@/features/irp/components";

export const Route = createFileRoute("/_authenticated/irp")({
  validateSearch: (search: Record<string, unknown>) => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
  component: Page,
  head: () =>
    routeHead({
      path: "/irp",
      title: "IRP",
      description:
        "Processamento e consolidação de planilhas IRP (Intenção de Registro de Preços) com apoio de IA.",
      noindex: true,
    }),
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  // ---------- Estado local mínimo ----------
  const [jobId, setJobId] = useState<string | null>(null);
  const [processoM2AForm, setProcessoM2AForm] = useState<ProcessoM2AForm>(
    () => buildDefaultProcessoM2AForm(),
  );

  // ---------- Hooks de dados ----------
  const { unidades, unidadeById } = useIrpUnidades();
  const {
    secretariasM2A,
    secretariaById,
    secretariaByNumero,
    secRowByNumero,
  } = useIrpSecretariasM2A(jobId);

  // Upload / análise da planilha
  const uploadAnalise = useIrpUploadAnalise({
    unidades,
    onBeforeAnalisar: useCallback(() => {
      setDetalheResultadoSafely(null);
    }, []),
    onJobCriado: useCallback((newJobId: string) => {
      setJobId(newJobId);
    }, []),
  });

  // Carrega resultado salvo via ?job=
  const detalhe = useIrpDetalhe({
    jobSearchParam: search.job,
    onLoadStart: useCallback(() => {
      uploadAnalise.setAnalise(null);
      uploadAnalise.setFile(null);
      setJobId(search.job ?? null);
    }, [search.job, uploadAnalise]),
    onLoadSuccess: useCallback((loadedId: string) => {
      setJobId(loadedId);
    }, []),
  });

  // Trick para permitir reset a partir de callbacks estáveis
  function setDetalheResultadoSafely(v: null) {
    detalhe.setResultadoSalvo(v);
  }

  // Downloads (item único, zip, salvos)
  const downloads = useIrpDownloads({
    analise: uploadAnalise.analise,
    resultadoSalvo: detalhe.resultadoSalvo,
    jobId,
  });

  // Regras de seleção / enriquecimento M2A
  const importRows = useIrpImportRows({
    analise: uploadAnalise.analise,
    resultadoSalvo: detalhe.resultadoSalvo,
    secretariaById,
    secretariaByNumero,
    unidadeById,
    fileName: uploadAnalise.file?.name ?? null,
    savedFileName: detalhe.resultadoSalvo?.job.original_filename ?? null,
    processoM2AForm,
    setProcessoM2AForm,
  });

  // Envio ao M2A
  const enviarM2A = useEnviarProcessoM2A({
    jobId,
    processoM2AForm,
    selectedImportRows: importRows.selectedImportRows,
    rowsMissingM2A: importRows.rowsMissingM2A,
    secretariasM2A,
    enrichRowForM2A: importRows.enrichRowForM2A,
  });

  // Histórico + exclusão de jobs
  const jobsList = useIrpJobsList({
    jobIdAtivo: jobId,
    onJobExcluidoAtivo: useCallback(() => {
      setJobId(null);
      detalhe.setResultadoSalvo(null);
      uploadAnalise.setAnalise(null);
    }, [detalhe, uploadAnalise]),
  });

  // ---------- Derivados de UI ----------
  const busy =
    uploadAnalise.busy ||
    downloads.busy ||
    enviarM2A.busy ||
    detalhe.loading;

  const analise = uploadAnalise.analise;
  const resultadoSalvo = detalhe.resultadoSalvo;

  const analiseSummary = useMemo(() => {
    if (!analise) return null;
    return {
      totalUnidades: analise.resultados.length,
      comItens: analise.resultados.filter((r) => r.itens.length > 0).length,
      totalItens: analise.resultados.reduce((s, r) => s + r.itens.length, 0),
      totalQuantidade: analise.resultados.reduce(
        (s, r) => s + r.somaQuantidade,
        0,
      ),
      totalValor: analise.resultados.reduce((s, r) => s + r.somaValor, 0),
    };
  }, [analise]);

  const analiseTableRows = useMemo<IrpSecretariaTableRow[]>(() => {
    if (!analise) return [];
    return analise.resultados.map((r) => ({
      key: `analise:${r.unidade.id}`,
      numero: r.unidade.numero,
      nome: r.unidade.nome,
      cabecalhoColuna: r.cabecalhoColuna,
      itens: r.itens.length,
      quantidade: r.somaQuantidade,
      valor: r.somaValor,
      status: r.status,
      selectable: r.itens.length > 0,
      downloadable: r.itens.length > 0,
    }));
  }, [analise]);

  const analiseIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!analise) return map;
    analise.resultados.forEach((r, i) => {
      map.set(`analise:${r.unidade.id}`, i);
    });
    return map;
  }, [analise]);

  const salvoTableRows = useMemo<IrpSecretariaTableRow[]>(() => {
    if (!resultadoSalvo) return [];
    return resultadoSalvo.secretarias.map((r) => ({
      key: `salvo:${r.id}`,
      numero: r.numero,
      nome: r.nome,
      cabecalhoColuna: r.cabecalho_coluna,
      itens: r.itens_validos,
      valor: Number(r.soma_valor),
      status: r.status ?? "—",
      selectable: !!r.arquivo && r.itens_validos > 0,
      downloadable: !!r.arquivo,
    }));
  }, [resultadoSalvo]);

  type SalvoRow = NonNullable<typeof resultadoSalvo>["secretarias"][number];
  const salvoArquivoByKey = useMemo(() => {
    const map = new Map<string, SalvoRow>();
    if (!resultadoSalvo) return map;
    resultadoSalvo.secretarias.forEach((r) => {
      map.set(`salvo:${r.id}`, r);
    });
    return map;
  }, [resultadoSalvo]);

  // ---------- Callbacks estáveis para tabela ----------
  const handleAnaliseDownload = useCallback(
    (key: string) => {
      const idx = analiseIndexByKey.get(key);
      if (idx == null) return;
      void downloads.baixarUm(idx);
    },
    [analiseIndexByKey, downloads],
  );

  const handleSalvoDownload = useCallback(
    (key: string) => {
      const row = salvoArquivoByKey.get(key);
      if (!row) return;
      void downloads.baixarArquivoSalvo(row.arquivo);
    },
    [downloads, salvoArquivoByKey],
  );

  const handleSelectJob = useCallback(
    (id: string) => {
      navigate({ to: "/irp", search: { job: id } });
    },
    [navigate],
  );

  const cabecalhoHelper =
    importRows.rowsMissingM2A.length > 0
      ? `${importRows.rowsMissingM2A.length} secretaria(s) sem cadastro M2A. Configure em /secretarias.`
      : `${importRows.selectedImportRows.length} de ${importRows.importableRows.length} planilha(s) selecionada(s).`;

  const cabecalhoSubmitDisabled =
    busy ||
    importRows.selectedImportRows.length === 0 ||
    importRows.rowsMissingM2A.length > 0;

  // ---------- Render ----------
  return (
    <IrpHeader>
      <IrpWorkflowGuide />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          {jobId || analise
            ? "Revisando planilha selecionada."
            : "Envie uma planilha IRP consolidada para começar."}
        </div>
        <div className="flex items-center gap-2">
          {(jobId || analise) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setJobId(null);
                uploadAnalise.setAnalise(null);
                uploadAnalise.setFile(null);
                detalhe.setResultadoSalvo(null);
                navigate({ to: "/irp", search: { job: undefined } });
              }}
            >
              Nova importação
            </Button>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Clock className="size-3.5" />
                Histórico
                {jobsList.jobs.length > 0 && (
                  <span className="ml-1 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
                    {jobsList.jobs.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Importações recentes</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <IrpJobsHistorySidebar
                  jobs={jobsList.jobs}
                  activeJobId={jobId}
                  onSelectJob={handleSelectJob}
                  onExcluirJob={(id) => void jobsList.excluirIrpJob(id)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        {!jobId && !analise && (
          <IrpUploadCard
            file={uploadAnalise.file}
            busy={uploadAnalise.busy}
            progress={uploadAnalise.progress}
            onFileChange={(f) => {
              uploadAnalise.setFile(f);
              uploadAnalise.setAnalise(null);
              detalhe.setResultadoSalvo(null);
            }}
            onAnalisar={() => void uploadAnalise.handleAnalisar()}
          />
        )}

        {(jobId || analise) && (
          <Card className="overflow-hidden border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-primary" />
                {resultadoSalvo && !analise
                  ? "Resultado salvo"
                  : "Resultado por secretaria"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IrpProcessoM2AProgress
                visible={enviarM2A.busy}
                etapa="Envio M2A"
                mensagem="Acompanhe o progresso detalhado na barra global."
                percent={0}
              />

              {jobId && (analise || resultadoSalvo) && (
                <div className="mb-4">
                  <IrpCabecalhoCard
                    jobId={jobId}
                    initialJob={resultadoSalvo?.job ?? null}
                    form={processoM2AForm}
                    onChange={setProcessoM2AForm}
                    onSubmit={enviarM2A.abrirConfirmacaoProcessoM2A}
                    submitDisabled={cabecalhoSubmitDisabled}
                    submitHelper={cabecalhoHelper}
                  />
                </div>
              )}

              {!analise && !resultadoSalvo ? (
                <EmptyState
                  icon={FileSpreadsheet}
                  title="Nenhuma análise carregada"
                  description="Envie uma planilha para visualizar os resultados por secretaria."
                />
              ) : analise && analiseSummary ? (
                <>
                  <IrpAnaliseSummary
                    totalUnidades={analiseSummary.totalUnidades}
                    comItens={analiseSummary.comItens}
                    totalItens={analiseSummary.totalItens}
                    totalQuantidade={analiseSummary.totalQuantidade}
                    totalValor={analiseSummary.totalValor}
                  />
                  <IrpBulkActionsBar
                    title="Planilhas analisadas"
                    selectedCount={importRows.selectedImportRows.length}
                    totalCount={importRows.importableRows.length}
                    missingCount={importRows.rowsMissingM2A.length}
                    onBaixarZip={() => void downloads.baixarZip()}
                    baixarZipDisabled={busy}
                  />
                  <IrpSecretariasTable
                    rows={analiseTableRows}
                    selectedKeys={importRows.selectedIrpImportIds}
                    allSelected={importRows.allImportRowsSelected}
                    showQuantidade
                    onToggleRow={importRows.toggleIrpImportSelection}
                    onToggleAll={importRows.toggleAllIrpImportSelection}
                    onDownload={handleAnaliseDownload}
                    downloadDisabled={busy}
                  />
                </>
              ) : resultadoSalvo ? (
                <>
                  <IrpResultadoSalvoCard
                    job={resultadoSalvo.job}
                    temZip={!!resultadoSalvo.zipFile}
                  />
                  <IrpBulkActionsBar
                    title="Resultado salvo"
                    selectedCount={importRows.selectedImportRows.length}
                    totalCount={importRows.importableRows.length}
                    missingCount={importRows.rowsMissingM2A.length}
                    onBaixarZip={() => void downloads.baixarZip()}
                    baixarZipDisabled={busy || !resultadoSalvo.zipFile}
                  />
                  <IrpSecretariasTable
                    rows={salvoTableRows}
                    selectedKeys={importRows.selectedIrpImportIds}
                    allSelected={importRows.allImportRowsSelected}
                    showCabecalho
                    onToggleRow={importRows.toggleIrpImportSelection}
                    onToggleAll={importRows.toggleAllIrpImportSelection}
                    onDownload={handleSalvoDownload}
                    downloadDisabled={busy}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>


      <IrpConfirmacaoProcessoModal
        open={enviarM2A.m2aConfirmOpen}
        onOpenChange={enviarM2A.setM2aConfirmOpen}
        busy={enviarM2A.busy}
        form={processoM2AForm}
        rows={importRows.selectedImportRows.map((r) => ({
          key: r.key,
          nome: r.nome,
          numero: r.numero,
          itens: r.itens,
          valor: r.valor,
          orgaoPk: r.orgaoPk,
          unidadePk: r.unidadePk,
        }))}
        secRowByNumero={secRowByNumero}
        onConfirm={() => void enviarM2A.confirmarCriacaoProcessoM2A()}
      />
    </IrpHeader>
  );
}
