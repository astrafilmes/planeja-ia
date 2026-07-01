import {
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { handleGlobalError } from "@/lib/error-handler";

/**
 * QueryClient único e compartilhado pela aplicação.
 *
 * Interceptadores globais: toda falha de query/mutation passa pelo
 * `handleGlobalError`. Hooks que já mostram toasts locais devem setar
 * `meta: { silent: true }` para evitar duplicação.
 *
 * Exportado a partir daqui (e não do `main.tsx`) para que módulos como
 * o `AuthProvider` possam reagir ao ciclo de vida do JWT invalidando o
 * cache sem criar ciclos de importação com o bootstrap da aplicação.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => handleGlobalError(error, query.meta, "query"),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) =>
      handleGlobalError(error, mutation.meta, "mutation"),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.statusCode;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
