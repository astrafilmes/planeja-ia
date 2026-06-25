import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ProgressStatus = "idle" | "running" | "success" | "error" | "cancelled";

export type ProgressLogEntry = {
  id: number;
  at: number;
  text: string;
  etapa?: string;
};

type ProgressState = {
  isVisible: boolean;
  title: string;
  statusText: string;
  progress: number;
  isIndeterminate: boolean;
  status: ProgressStatus;
  logs: ProgressLogEntry[];
  cancellable: boolean;
};

type ProgressContextValue = ProgressState & {
  startTask: (
    title: string,
    statusText?: string,
    options?: { onCancel?: () => void },
  ) => void;
  updateProgress: (
    progress: number,
    statusText?: string,
    options?: { isIndeterminate?: boolean; etapa?: string; addLog?: boolean },
  ) => void;
  finishTask: (successMessage: string) => void;
  failTask: (errorMessage: string) => void;
  cancelTask: () => void;
  closeTracker: () => void;
};

const initialState: ProgressState = {
  isVisible: false,
  title: "",
  statusText: "",
  progress: 0,
  isIndeterminate: false,
  status: "idle",
  logs: [],
  cancellable: false,
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

let logSeq = 0;

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>(initialState);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCancelRef = useRef<(() => void) | null>(null);

  const clearAutoClose = useCallback(() => {
    if (!autoCloseRef.current) return;
    clearTimeout(autoCloseRef.current);
    autoCloseRef.current = null;
  }, []);

  const closeTracker = useCallback(() => {
    clearAutoClose();
    onCancelRef.current = null;
    setState(initialState);
  }, [clearAutoClose]);

  const startTask = useCallback(
    (title: string, statusText = "Preparando tarefa...", options?: { onCancel?: () => void }) => {
      clearAutoClose();
      onCancelRef.current = options?.onCancel ?? null;
      setState({
        isVisible: true,
        title,
        statusText,
        progress: 0,
        isIndeterminate: true,
        status: "running",
        logs: [],
        cancellable: Boolean(options?.onCancel),
      });
    },
    [clearAutoClose],
  );

  const updateProgress = useCallback(
    (
      progress: number,
      statusText?: string,
      options?: { isIndeterminate?: boolean; etapa?: string; addLog?: boolean },
    ) => {
      clearAutoClose();
      setState((current) => {
        const nextStatusText = statusText ?? current.statusText;
        const shouldLog =
          (options?.addLog ?? true) &&
          statusText &&
          statusText !== current.statusText;
        const logs = shouldLog
          ? [
              ...current.logs.slice(-49),
              {
                id: ++logSeq,
                at: Date.now(),
                text: statusText!,
                etapa: options?.etapa,
              },
            ]
          : current.logs;
        return {
          ...current,
          isVisible: true,
          status: "running",
          statusText: nextStatusText,
          progress: clampProgress(progress),
          isIndeterminate: options?.isIndeterminate ?? false,
          logs,
        };
      });
    },
    [clearAutoClose],
  );

  const scheduleClose = useCallback(() => {
    clearAutoClose();
    autoCloseRef.current = setTimeout(() => {
      setState(initialState);
      onCancelRef.current = null;
      autoCloseRef.current = null;
    }, 5000);
  }, [clearAutoClose]);

  const finishTask = useCallback(
    (successMessage: string) => {
      onCancelRef.current = null;
      setState((current) => ({
        ...current,
        isVisible: true,
        statusText: successMessage,
        progress: 100,
        isIndeterminate: false,
        status: "success",
        cancellable: false,
      }));
      scheduleClose();
    },
    [scheduleClose],
  );

  const failTask = useCallback(
    (errorMessage: string) => {
      clearAutoClose();
      onCancelRef.current = null;
      setState((current) => ({
        ...current,
        isVisible: true,
        statusText: errorMessage,
        isIndeterminate: false,
        status: "error",
        cancellable: false,
      }));
    },
    [clearAutoClose],
  );

  const cancelTask = useCallback(() => {
    const cb = onCancelRef.current;
    onCancelRef.current = null;
    if (cb) {
      try {
        cb();
      } catch (err) {
        console.error("[progress] erro no onCancel:", err);
      }
    }
    setState((current) => ({
      ...current,
      isVisible: true,
      status: "cancelled",
      statusText: "Cancelando…",
      isIndeterminate: true,
      cancellable: false,
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      startTask,
      updateProgress,
      finishTask,
      failTask,
      cancelTask,
      closeTracker,
    }),
    [closeTracker, failTask, finishTask, startTask, state, updateProgress, cancelTask],
  );

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error("useProgress deve ser usado dentro de ProgressProvider.");
  }
  return context;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
