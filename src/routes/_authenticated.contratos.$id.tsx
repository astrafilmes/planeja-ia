import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { routeHead } from "@/lib/utils/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Paperclip, Users } from "lucide-react";
import {
  useContratoDetalhe,
  useContratoForm,
  useEnviarContratoM2A,
  useItemMutations,
  useSincronizarContratoM2A,
} from "@/features/contrato-detalhe/hooks";
import {
  ContratoAtoresTab,
  ContratoDocumentosTab,
  ContratoErrorState,
  ContratoFormSection,
  ContratoHeaderActions,
  ContratoItensTab,
  ContratoKPICard,
  ContratoLoadingState,
  ContratoWorkflowGuide,
  EnvioM2ASection,
  ItemDeleteDialog,
  ItemEditDialog,
  ItemWarnDialog,
} from "@/features/contrato-detalhe/components";
import {
  calcValorTotal,
  documentosM2ACount as calcDocumentosM2ACount,
} from "@/features/contrato-detalhe/lib";

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  component: Page,
  head: ({ params }) =>
    routeHead({
      path: `/contratos/${params?.id ?? ""}`,
      title: `Contrato ${params?.id ?? ""}`.trim(),
      description:
        "Visualize itens, fiscais, documentos e histórico do contrato no Planeja IA.",
      ogType: "article",
      noindex: true,
    }),
});

function Page() {
  const { id } = Route.useParams();

  const { data: contrato, isLoading, error, refetch } = useContratoDetalhe(id);

  const form = useContratoForm(id, contrato);
  const envio = useEnviarContratoM2A(id, contrato, refetch);
  const sincro = useSincronizarContratoM2A(contrato, () => {
    void refetch();
  });
  const itemMut = useItemMutations(refetch);

  const itens = useMemo(() => contrato?.itens ?? [], [contrato?.itens]);
  const valorTotal = useMemo(() => calcValorTotal(itens), [itens]);

  if (isLoading) return <ContratoLoadingState />;
  if (error || !contrato)
    return (
      <ContratoErrorState
        error={(error as Error) ?? null}
        onRetry={() => refetch()}
      />
    );

  const c = contrato.contrato;
  const statusM2A = c.status_envio_m2a ?? "pendente";
  const documentosTotalCount =
    contrato.documentos.length + calcDocumentosM2ACount(c.m2a_documentos_gerados);

  return (
    <AppShell
      title={`Contrato ${c.numero_contrato}`}
      subtitle={c.objeto}
      actions={
        <ContratoHeaderActions
          contratoId={id}
          enviando={envio.enviando}
          connected={envio.connected}
          statusM2A={statusM2A}
          onEnviar={envio.handleEnviar}
          onStatusChanged={() => refetch()}
        />
      }
    >
      <ContratoWorkflowGuide contrato={contrato} statusM2A={statusM2A} />

      <ContratoKPICard
        contrato={contrato}
        valorTotal={valorTotal}
        itensCount={itens.length}
        documentosCount={contrato.documentos.length}
        statusM2A={statusM2A}
      />

      <ContratoFormSection
        editNumeroContrato={form.editNumeroContrato}
        setEditNumeroContrato={form.setEditNumeroContrato}
        editData={form.editData}
        setEditData={form.setEditData}
        editAtaId={form.editAtaId}
        setEditAtaId={form.setEditAtaId}
        editPreposto={form.editPreposto}
        setEditPreposto={form.setEditPreposto}
        editFiscal={form.editFiscal}
        setEditFiscal={form.setEditFiscal}
        editObjeto={form.editObjeto}
        setEditObjeto={form.setEditObjeto}
        m2aAtas={contrato.m2aAtas}
        salvando={form.salvandoM2AConfig}
        onSalvar={form.handleSalvarContratoM2AConfig}
      />

      <EnvioM2ASection
        pct={envio.pct}
        logs={envio.logs}
        ultimoErro={c.ultimo_erro_m2a}
        m2aUrl={contrato.processo?.m2a_url}
      />

      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens">
            <FileText className="size-3.5" /> Itens ({itens.length})
          </TabsTrigger>
          <TabsTrigger value="atores">
            <Users className="size-3.5" /> Servidores ({contrato.atores.length})
          </TabsTrigger>
          <TabsTrigger value="docs">
            <Paperclip className="size-3.5" /> Documentos ({documentosTotalCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="itens">
          <ContratoItensTab
            itens={itens}
            valorTotal={valorTotal}
            onItemAction={itemMut.requestItemAction}
          />
        </TabsContent>

        <TabsContent value="atores">
          <ContratoAtoresTab
            contratoId={id}
            atores={contrato.atores}
            contrato={c}
            secretaria={contrato.secretaria}
            locked={statusM2A === "sucesso"}
            onChange={refetch}
          />
        </TabsContent>

        <TabsContent value="docs">
          <ContratoDocumentosTab
            contratoId={id}
            contrato={c}
            documentos={contrato.documentos}
            onChange={refetch}
          />
        </TabsContent>
      </Tabs>

      <ItemWarnDialog
        open={!!itemMut.warnPending}
        dontShow={itemMut.warnDontShow}
        onDontShowChange={itemMut.setWarnDontShow}
        onCancel={itemMut.cancelWarn}
        onConfirm={itemMut.confirmWarn}
      />

      <ItemEditDialog
        item={itemMut.editingItem}
        form={itemMut.editForm}
        onFormChange={(updater) => itemMut.setEditForm(updater)}
        saving={itemMut.savingItem}
        onCancel={itemMut.cancelEdit}
        onSave={itemMut.saveItemEdit}
      />

      <ItemDeleteDialog
        item={itemMut.deletingItem}
        saving={itemMut.savingItem}
        onCancel={itemMut.cancelDelete}
        onConfirm={itemMut.deleteItemConfirmed}
      />
    </AppShell>
  );
}
