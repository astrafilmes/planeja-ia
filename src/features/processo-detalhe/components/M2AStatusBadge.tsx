import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type StatusEntry = {
  label: string;
  cls: string;
  Icon: typeof CheckCircle2;
};

const STATUS_MAP: Record<string, StatusEntry> = {
  enviado: {
    label: "Enviado",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  sucesso: {
    label: "Enviado",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  erro: {
    label: "Erro",
    cls: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
    Icon: XCircle,
  },
  processando: {
    label: "Processando",
    cls: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
    Icon: Loader2,
  },
  pendente: {
    label: "Pendente",
    cls: "border-border/60 bg-muted/40 text-muted-foreground dark:text-muted-foreground",
    Icon: Clock,
  },
};

export interface M2AStatusBadgeProps {
  status: string;
}

export function M2AStatusBadge({ status }: M2AStatusBadgeProps) {
  const entry = STATUS_MAP[status] ?? STATUS_MAP.pendente;
  return (
    <Badge variant="outline" className={`gap-1 ${entry.cls}`}>
      <entry.Icon
        className={`size-3 ${status === "processando" ? "animate-spin" : ""}`}
      />
      {entry.label}
    </Badge>
  );
}
