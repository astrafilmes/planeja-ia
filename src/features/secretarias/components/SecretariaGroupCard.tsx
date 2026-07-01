import { memo, type ReactNode } from "react";
import { Building2, ChevronDown, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SecretariaGroup } from "../lib";

export type SecretariaGroupCardProps = {
  group: SecretariaGroup;
  expanded: boolean;
  onToggle: (key: string, open: boolean) => void;
  onEditGroup: (group: SecretariaGroup) => void;
  children: ReactNode;
};

function SecretariaGroupCardImpl({
  group,
  expanded,
  onToggle,
  onEditGroup,
  children,
}: SecretariaGroupCardProps) {
  const hasMixedFiscal = group.fiscaisCount > 1;
  const hasMixedGestor = group.gestoresCount > 1;

  return (
    <Collapsible open={expanded} onOpenChange={(value) => onToggle(group.key, value)}>
      <Card className="overflow-hidden border-border/60 bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 dark:bg-muted/30">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0">
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  !expanded && "-rotate-90",
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-foreground text-background dark:bg-muted">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {group.title}
            </div>
            <div className="truncate text-[13px] text-muted-foreground">
              {group.subtitle}
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Badge variant="outline">
              {group.ativosCount}/{group.rows.length} ativa(s)
            </Badge>
            {hasMixedFiscal && <Badge variant="secondary">Fiscal misto</Badge>}
            {hasMixedGestor && <Badge variant="secondary">Gestor misto</Badge>}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditGroup(group)}
          >
            <UsersRound className="size-3.5" />
            Editar grupo
          </Button>
        </div>

        <CollapsibleContent>
          <div>{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export const SecretariaGroupCard = memo(SecretariaGroupCardImpl);
