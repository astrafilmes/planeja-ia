import { toast, type ExternalToast } from "sonner";

/**
 * Camada única de notificação — todo o app deve usar `notify.*` em vez de
 * chamar `toast.*` direto ou disparar `window.alert/confirm`.
 *
 * A implementação encapsula o Sonner, mas o resto do código não deve saber
 * disso: assim é possível trocar a lib no futuro sem quebrar chamadas.
 */
type NotifyOptions = ExternalToast;

function success(message: string, options?: NotifyOptions) {
  return toast.success(message, options);
}

function error(message: string, options?: NotifyOptions) {
  return toast.error(message, options);
}

function warning(message: string, options?: NotifyOptions) {
  return toast.warning(message, options);
}

function info(message: string, options?: NotifyOptions) {
  return toast.info(message, options);
}

function message(text: string, options?: NotifyOptions) {
  return toast(text, options);
}

function loading(text: string, options?: NotifyOptions) {
  return toast.loading(text, options);
}

function promise<T>(
  p: Promise<T>,
  msgs: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((err: unknown) => string);
  },
) {
  return toast.promise(p, msgs);
}

function dismiss(id?: string | number) {
  return toast.dismiss(id);
}

/**
 * Confirmação leve via toast, para substituir `window.confirm`.
 * Para operações destrutivas, prefira `<AlertDialog>` ou usar `notify.confirmAsync`.
 */
function confirmAsync(question: string, opts?: { confirmLabel?: string; cancelLabel?: string }) {
  return new Promise<boolean>((resolve) => {
    const id = toast(question, {
      duration: 15_000,
      action: {
        label: opts?.confirmLabel ?? "Confirmar",
        onClick: () => {
          toast.dismiss(id);
          resolve(true);
        },
      },
      cancel: {
        label: opts?.cancelLabel ?? "Cancelar",
        onClick: () => {
          toast.dismiss(id);
          resolve(false);
        },
      },
      onDismiss: () => resolve(false),
      onAutoClose: () => resolve(false),
    });
  });
}

export const notify = {
  success,
  error,
  warning,
  info,
  message,
  loading,
  promise,
  dismiss,
  confirmAsync,
};

export type { NotifyOptions };
