import { useCallback, useState } from "react";
import type { Sec } from "../lib";

export function useSecretariaDeleteDialog() {
  const [deleting, setDeleting] = useState<Sec | null>(null);

  const open = useCallback((sec: Sec) => setDeleting(sec), []);
  const close = useCallback(() => setDeleting(null), []);

  return { deleting, setDeleting, open, close };
}
