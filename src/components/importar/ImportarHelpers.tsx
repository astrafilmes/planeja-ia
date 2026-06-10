import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, Save, History } from "lucide-react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`mt-0.5 ${highlight ? "text-base font-semibold" : "text-sm font-medium"} truncate`}
      >
        {value}
      </div>
    </div>
  );
}

export function M2ASyncReport({ syncData }: { syncData: any }) {
  const resumo = syncData?.resumo;
  if (!resumo) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-3 dark:bg-emerald-500/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          Dados do portal
        </div>
        <div className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400">
          <History className="size-3" /> Sincronizado
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="text-center">
          <div className="text-xs font-bold text-foreground">
            {resumo.qtd_atas}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Atas</div>
        </div>
        <div className="border-x border-slate-200 text-center dark:border-slate-800">
          <div className="text-xs font-bold text-foreground">
            {resumo.qtd_itens}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">
            Itens
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold text-amber-600">
            {resumo.qtd_contratos}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">
            Contratos
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Último número por Secretaria:
        </div>
        <div className="max-h-32 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Table>
            <TableBody>
              {Object.entries(resumo.ultimo_numero_por_secretaria || {}).map(
                ([sec, num]: [string, any]) => (
                  <TableRow key={sec} className="hover:bg-transparent">
                    <TableCell className="py-1 px-2 text-[10px] leading-tight">
                      {sec}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-right">
                      <Badge
                        variant="outline"
                        className="font-mono text-[9px] h-4 px-1 bg-background"
                      >
                        {String(num).padStart(3, "0")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export function ValorUnitInput({
  initial,
  onSave,
  disabled,
}: {
  initial: number;
  onSave: (v: number) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string>(String(initial ?? 0));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const baselineRef = useRef<number>(Number(initial ?? 0));
  const dirty = parseFloat(value || "0") !== baselineRef.current;

  async function commit() {
    const v = parseFloat(value || "0");
    if (v === baselineRef.current) return;
    setSaving(true);
    try {
      await onSave(v);
      baselineRef.current = v;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Input
        type="number"
        step="0.01"
        disabled={disabled}
        className="h-9 w-28 text-right font-mono text-[13px]"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={commit}
      />
      <Button
        type="button"
        size="icon"
        variant={dirty ? "default" : "ghost"}
        className="size-7 shrink-0"
        disabled={disabled || saving || !dirty}
        onClick={commit}
        title="Salvar (Enter)"
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : saved ? (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        ) : (
          <Save className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
