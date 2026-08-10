import { supabase } from "@/integrations/supabase/client";

export async function resetContratosGVasconcelos() {
  const { data, error } = await supabase
    .from("contratos")
    .update({ status: "pendente" })
    .eq("processo_id", "024/2025") // Número amigável do processo
    .ilike("fornecedor_nome", "%G. VASCONCELOS NETO%");

  if (error) {
    console.error("Erro ao resetar contratos:", error);
    return { success: false, error };
  }
  
  console.log("Contratos resetados com sucesso:", data);
  return { success: true, count: data?.length };
}
