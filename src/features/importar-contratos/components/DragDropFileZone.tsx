import { memo, useCallback, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DragDropFileZone = memo(function DragDropFileZone({
  file,
  onFileChange,
  accept = ".xlsx",
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const f = e.dataTransfer.files?.[0];
      if (f) onFileChange(f);
    },
    [onFileChange, disabled],
  );

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-strong">
          <FileSpreadsheet className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {file.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatSize(file.size)}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onFileChange(null)}
          disabled={disabled}
          aria-label="Remover arquivo"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
        dragOver
          ? "border-accent bg-accent-soft/50"
          : "border-border bg-muted/20 hover:border-accent/60 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="grid size-10 place-items-center rounded-full bg-background text-muted-foreground shadow-sm">
        <UploadCloud className="size-5" />
      </div>
      <div className="text-sm text-foreground">
        Arraste a planilha {accept} aqui ou{" "}
        <span className="font-medium text-accent-strong">clique para buscar</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
});
