import { useCallback, useEffect, useState } from "react";
import { emptySec, type Sec } from "../lib";

export function useSecretariaForm() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sec>(emptySec());

  useEffect(() => {
    if (!open) setEditing(emptySec());
  }, [open]);

  const openNew = useCallback(() => {
    setEditing(emptySec());
    setOpen(true);
  }, []);

  const openEdit = useCallback((secretaria: Sec) => {
    setEditing({ ...secretaria });
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, setOpen, editing, setEditing, openNew, openEdit, close };
}
