import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Type, Clock, AlignLeft } from "lucide-react";

export type ReminderPayload = {
  date: Date;
  title: string;
  time: string;
  description: string;
};

interface ReminderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date | null;
  onSave?: (payload: ReminderPayload) => void;
}

function formatDate(date: Date | null) {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function ReminderDialog({
  isOpen,
  onClose,
  date,
  onSave,
}: ReminderDialogProps) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setTime("");
      setDescription("");
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!date) return;
    // TODO: conectar ao Supabase para persistir o lembrete
    // await supabase.from("lembretes").insert({ ... });
    onSave?.({ date, title, time, description });
    onClose();
  };

  const formatted = formatDate(date);
  const formattedCapitalized =
    formatted.charAt(0).toUpperCase() + formatted.slice(1);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Novo Lembrete
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {formattedCapitalized}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="reminder-title" className="flex items-center gap-1.5 normal-case tracking-normal text-[13px] font-medium text-foreground">
              <Type className="size-3.5 text-slate-400" />
              Título
            </Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Reunião de planejamento"
              className="h-10 rounded-md"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-time" className="flex items-center gap-1.5 normal-case tracking-normal text-[13px] font-medium text-foreground">
              <Clock className="size-3.5 text-slate-400" />
              Horário
            </Label>
            <Input
              id="reminder-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-10 rounded-md"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-description" className="flex items-center gap-1.5 normal-case tracking-normal text-[13px] font-medium text-foreground">
              <AlignLeft className="size-3.5 text-slate-400" />
              Descrição
            </Label>
            <Textarea
              id="reminder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes do lembrete..."
              className="min-h-[100px] rounded-md resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <div className="flex-1" />
          <Button onClick={handleSave} disabled={!title.trim()}>
            Salvar Lembrete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
