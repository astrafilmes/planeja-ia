import { supabase } from "@/integrations/supabase/client";

export async function logAudit(opts: {
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: opts.action,
    entity_type: opts.entityType,
    entity_id: opts.entityId ?? null,
    request_payload: (opts.payload ?? {}) as any,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
}
