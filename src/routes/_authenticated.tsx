import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { tryRestoreFromTrustedDevice } from "@/lib/trusted-device";

/**
 * Layout route de rotas autenticadas.
 *
 * Todo o subtree `/_authenticated/*` (dashboard, processos, contratos, etc.)
 * herda deste guard. A checagem acontece em `beforeLoad` — **antes** do React
 * montar a árvore, das queries dispararem e do AppShell renderizar. Isso elimina:
 *   1. Flashes visuais de páginas privadas para usuários deslogados.
 *   2. Requisições autenticadas partindo sem sessão (que caem em 401 e poluem
 *      o global error handler).
 *
 * A `search.redirect` preserva o destino original para que o /login possa
 * enviar o usuário de volta após autenticar.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // 1) Sessão vigente no client (localStorage / cookie do Supabase).
    let {
      data: { session },
    } = await supabase.auth.getSession();

    // 2) Fallback: tenta restaurar via "Confiar neste dispositivo" antes de
    //    redirecionar. Cobre o primeiro carregamento onde o AuthProvider ainda
    //    não teve tempo de rodar sua restauração.
    if (!session) {
      const restored = await tryRestoreFromTrustedDevice();
      if (restored) {
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }
    }

    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
