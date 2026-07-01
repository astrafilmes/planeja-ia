import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { Plus } from "lucide-react";
import { routeHead } from "@/lib/utils/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SecretariaDeleteDialog,
  SecretariaEditDialog,
  SecretariaGroupCard,
  SecretariaGroupEditDialog,
  SecretariaGroupTable,
  SecretariasEmptyState,
  SecretariasStatsBar,
  SecretariasToolbar,
} from "@/features/secretarias/components";
import {
  useSecretariaDeleteDialog,
  useSecretariaForm,
  useSecretariaGroupForm,
  useSecretariaMutations,
  useSecretariasFilters,
  useSecretariasQuery,
} from "@/features/secretarias/hooks";
import type { EnrichedSec } from "@/features/secretarias/lib";

export const Route = createFileRoute("/secretarias")({
  component: Page,
  head: () =>
    routeHead({
      path: "/secretarias",
      title: "Secretarias",
      description:
        "Cadastre e organize as secretarias requisitantes participantes do planejamento de contratações.",
    }),
});

function Page() {
  const { rows, enrichedRows, isLoading, unidadesGestoras, fiscais, gestores } =
    useSecretariasQuery();

  const filters = useSecretariasFilters(
    enrichedRows,
    unidadesGestoras,
    fiscais,
    gestores,
  );
  const mutations = useSecretariaMutations(fiscais, gestores);
  const form = useSecretariaForm();
  const groupForm = useSecretariaGroupForm();
  const deleteDialog = useSecretariaDeleteDialog();

  const handleEditRow = useCallback(
    (row: EnrichedSec) => form.openEdit(row),
    [form],
  );
  const handleDeleteRow = useCallback(
    (row: EnrichedSec) => deleteDialog.open(row),
    [deleteDialog],
  );

  const handleSave = useCallback(async () => {
    const ok = await mutations.save(form.editing);
    if (ok) form.close();
  }, [form, mutations]);

  const handleSaveGroup = useCallback(async () => {
    if (!groupForm.groupEditing) return;
    const ok = await mutations.saveGroup(
      groupForm.groupEditing,
      groupForm.groupForm,
    );
    if (ok) groupForm.close();
  }, [groupForm, mutations]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteDialog.deleting) return;
    const ok = await mutations.remove(deleteDialog.deleting);
    if (ok) deleteDialog.close();
  }, [deleteDialog, mutations]);

  return (
    <AppShell
      title="Secretarias"
      subtitle="Unidades gestoras, dotações e responsáveis por grupo"
      actions={
        <Button size="sm" onClick={form.openNew}>
          <Plus className="size-4" /> Nova
        </Button>
      }
    >
      <SecretariasToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        statusFilter={filters.statusFilter}
        onStatusFilterChange={filters.setStatusFilter}
        onExpandAll={filters.expandAll}
        onCollapseAll={filters.collapseAll}
        duplicateCount={filters.duplicateServidorNames.length}
      />

      <SecretariasStatsBar
        groupCount={filters.secretariaGroups.length}
        filteredCount={filters.filteredRows.length}
        totalCount={rows.length}
      />

      <div className="flex flex-col gap-3">
        {isLoading && (
          <Card className="border-border/60 p-8 text-center text-[13px] text-muted-foreground dark:text-muted-foreground">
            Carregando secretarias...
          </Card>
        )}

        {!isLoading && filters.secretariaGroups.length === 0 && (
          <SecretariasEmptyState onNew={form.openNew} />
        )}

        {filters.secretariaGroups.map((group) => (
          <SecretariaGroupCard
            key={group.key}
            group={group}
            expanded={filters.expandedGroups.has(group.key)}
            onToggle={filters.toggleGroup}
            onEditGroup={groupForm.openGroupEdit}
          >
            <SecretariaGroupTable
              group={group}
              onEditRow={handleEditRow}
              onDeleteRow={handleDeleteRow}
            />
          </SecretariaGroupCard>
        ))}
      </div>

      <SecretariaGroupEditDialog
        group={groupForm.groupEditing}
        form={groupForm.groupForm}
        onChange={groupForm.setGroupForm}
        unidadesGestoras={unidadesGestoras}
        fiscais={fiscais}
        gestores={gestores}
        isSaving={mutations.isSaving}
        onSave={handleSaveGroup}
        onCancel={groupForm.close}
      />

      <SecretariaEditDialog
        open={form.open}
        editing={form.editing}
        onChange={form.setEditing}
        unidadesGestoras={unidadesGestoras}
        fiscais={fiscais}
        gestores={gestores}
        isSaving={mutations.isSaving}
        onSave={handleSave}
        onOpenChange={form.setOpen}
      />

      <SecretariaDeleteDialog
        item={deleteDialog.deleting}
        isDeleting={mutations.isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={deleteDialog.close}
      />
    </AppShell>
  );
}
