import { memo } from "react";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";

export type SecretariasEmptyStateProps = {
  onNew: () => void;
};

function SecretariasEmptyStateImpl({ onNew }: SecretariasEmptyStateProps) {
  return (
    <Card className="border-border/60">
      <EmptyState
        icon={Building2}
        title="Nenhuma secretaria encontrada"
        description="Ajuste os filtros ou cadastre uma nova secretaria."
        action={
          <Button size="sm" onClick={onNew}>
            <Plus className="size-4" /> Nova secretaria
          </Button>
        }
      />
    </Card>
  );
}

export const SecretariasEmptyState = memo(SecretariasEmptyStateImpl);
