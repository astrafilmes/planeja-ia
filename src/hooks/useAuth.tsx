import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { queryClient } from "@/lib/query-client";

import {
  clearTrustedToken,
  revokeCurrentTrustedDevice,
  tryRestoreFromTrustedDevice,
} from "@/lib/trusted-device";

type Role = "admin" | "gestor" | "operador" | "consulta";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: Role[];
  isAdmin: boolean;
  isGestor: boolean;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }

      // Ciclo de vida do JWT: refletir mudanças de sessão no cache.
      // - SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED: invalida tudo para
      //   forçar refetch autenticado (evita respostas cacheadas do usuário anterior
      //   ou com token expirado).
      // - SIGNED_OUT: limpa completamente o cache para não vazar dados entre sessões.
      switch (event) {
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
        case "USER_UPDATED":
          queryClient.invalidateQueries();
          break;
        case "SIGNED_OUT":
          queryClient.cancelQueries();
          queryClient.clear();
          break;
        default:
          break;
      }
    });

    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        await fetchRoles(s.user.id);
        setLoading(false);
        return;
      }
      // Sem sessão: tenta restaurar via "Confiar neste dispositivo"
      const restored = await tryRestoreFromTrustedDevice();
      if (restored) {
        const { data: { session: s2 } } = await supabase.auth.getSession();
        setSession(s2);
        setUser(s2?.user ?? null);
        if (s2?.user) await fetchRoles(s2.user.id);
      }
      setLoading(false);
    })();

    return () => subscription.unsubscribe();
  }, []);

  async function fetchRoles(uid: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    setRoles((data ?? []).map((r: any) => r.role as Role));
  }

  async function signOut() {
    try {
      await revokeCurrentTrustedDevice();
    } catch {
      /* noop */
    }
    clearTrustedToken();
    await supabase.auth.signOut();
  }


  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        isAdmin: roles.includes("admin"),
        isGestor: roles.includes("admin") || roles.includes("gestor"),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
