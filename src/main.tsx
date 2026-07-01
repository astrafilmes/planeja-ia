import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { handleGlobalError } from "@/lib/error-handler";
import "./index.css";

const queryClient = new QueryClient({
  // Interceptadores globais: toda falha de query/mutation passa por aqui.
  // Hooks que já tratam erros localmente devem setar `meta: { silent: true }`
  // para evitar toasts duplicados.
  queryCache: new QueryCache({
    onError: (error, query) => handleGlobalError(error, query.meta, "query"),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) =>
      handleGlobalError(error, mutation.meta, "mutation"),
  }),
  defaultOptions: {
    queries: {
      // Dados servidos do cache instantaneamente ao voltar para a página;
      // refetch em background depois de 30s.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Não insistir em erros 4xx (permissão, payload). Apenas 1 retry para 5xx/network.
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.statusCode;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
