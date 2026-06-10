import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Restaurado do backup: aponta para o projeto Supabase original do sistema Planejamento.
// A anon key é publishable (segura para o cliente). RLS controla o acesso.
const supabaseUrl = "https://abrjvncynywqpxppclxe.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFicmp2bmN5bnl3cXB4cHBjbHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzE1MzYsImV4cCI6MjA5NTgwNzUzNn0.ORkzOEb1rsEIt6pGwZjgVkPzPu-s4xS9jxkZajRhRtY";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
