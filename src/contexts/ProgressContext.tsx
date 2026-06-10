import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ProgressStatus = "idle" | "running" | "success" | "error";

type ProgressState = {
  isVisible: boolean;
  title: string;
  statusText: string;
  progress: number;
  isIndeterminate: boolean;
  status: ProgressStatus;
};

type ProgressContextValue = ProgressState & {
  startTask: (title: string, statusText?: string) => void;
  updateProgress: (
    progress: number,
    statusText?: string,
    options?: { isIndeterminate?: boolean },
  ) => void;
  finishTask: (successMessage: string) => void;
  failTask: (errorMessage: string) => void;
  closeTracker: () => void;
};

const initialState: ProgressState = {
  isVisible: false,
  title: "",
  statusText: "",
  progress: 0,
  isIndeterminate: false,
  status: "idle",
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>(initialState);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoClose = useCallback(() => {
    if (!autoCloseRef.current) return;
    clearTimeout(autoCloseRef.current);
    autoCloseRef.current = null;
  }, []);

  const closeTracker = useCallback(() => {
    clearAutoClose();
    setState(initialState);
  }, [clearAutoClose]);

  const startTask = useCallback(
    (title: string, statusText = "Preparando tarefa...") => {
      clearAutoClose();
      setState({
        isVisible: true,
        title,
        statusText,
        progress: 0,
        isIndeterminate: true,
        status: "running",
      });
    },
    [clearAutoClose],
  );

  const updateProgress = useCallback(
    (
      progress: number,
      statusText?: string,
      options?: { isIndeterminate?: boolean },
    ) => {
      clearAutoClose();
      setState((current) => ({
        ...current,
        isVisible: true,
        status: "running",
        statusText: statusText ?? current.statusText,
        progress: clampProgress(progress),
        isIndeterminate: options?.isIndeterminate ?? false,
      }));
    },
    [clearAutoClose],
  );

  const scheduleClose = useCallback(() => {
    clearAutoClose();
    autoCloseRef.current = setTimeout(() => {
      setState(initialState);
      autoCloseRef.current = null;
    }, 3000);
  }, [clearAutoClose]);

  const finishTask = useCallback(
    (successMessage: string) => {
      setState((current) => ({
        ...current,
        isVisible: true,
        statusText: successMessage,
        progress: 100,
        isIndeterminate: false,
        status: "success",
      }));
      scheduleClose();
    },
    [scheduleClose],
  );

  const failTask = useCallback(
    (errorMessage: string) => {
      clearAutoClose();
      setState((current) => ({
        ...current,
        isVisible: true,
        statusText: errorMessage,
        isIndeterminate: false,
        status: "error",
      }));
    },
    [clearAutoClose],
  );

  const value = useMemo(
    () => ({
      ...state,
      startTask,
      updateProgress,
      finishTask,
      failTask,
      closeTracker,
    }),
    [closeTracker, failTask, finishTask, startTask, state, updateProgress],
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
