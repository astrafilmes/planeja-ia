import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Use ao menos 8 caracteres")
      .max(72)
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[a-z]/, "Inclua uma letra minúscula")
      .regex(/[0-9]/, "Inclua um número"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

function ResetPassword() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  // Supabase delivers the recovery session via URL hash; the SDK consumes it
  // automatically and emits a PASSWORD_RECOVERY event. We listen for it (and
  // also probe getSession on mount) before allowing the form.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setHasRecoverySession(true);
      if (session) setHasRecoverySession(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecoverySession(true);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const watched = form.watch("password");
  const strength = useMemo(() => passwordStrength(watched ?? ""), [watched]);
  const strengthLabel =
    ["Muito fraca", "Fraca", "Razoável", "Forte", "Excelente"][strength] ?? "";

  async function onSubmit(v: z.infer<typeof schema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: v.password });
    setSubmitting(false);
    if (error)
      return toast.error("Não foi possível atualizar a senha", {
        description: error.message,
      });
    toast.success("Senha redefinida", {
      description: "Você já pode entrar com a nova senha.",
    });
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="relative grid min-h-screen place-items-center bg-[#f6f5f1] px-5 py-10 text-slate-900 dark:bg-[#0a0d14] dark:text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.85 0.05 195 / 0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[440px]">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Voltar para o login
        </Link>

        <header className="mb-7">
          <h2
            className="text-[34px] leading-none tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Defina uma nova senha
          </h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Escolha uma senha forte. Você será redirecionado ao login após a
            confirmação.
          </p>
        </header>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
          {!ready ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !hasRecoverySession ? (
            <div className="space-y-3 py-4 text-center">
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="text-base font-semibold">Link inválido ou expirado</h3>
              <p className="text-[13px] text-muted-foreground">
                Solicite um novo link de recuperação na tela de login.
              </p>
              <Button asChild className="mt-2 w-full" size="lg">
                <Link to="/login">Voltar para o login</Link>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-pw" className="text-[13px] font-medium">
                  Nova senha
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-muted-foreground">
                    <Lock className="size-4" />
                  </span>
                  <Input
                    id="rp-pw"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mín. 8 caracteres, com maiúscula e número"
                    className="pl-9 pr-10"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute inset-y-0 right-2 grid place-items-center px-2 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPw ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-[12.5px] text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength
                          ? strength <= 1
                            ? "bg-destructive"
                            : strength === 2
                              ? "bg-warning"
                              : strength === 3
                                ? "bg-info"
                                : "bg-success"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  {watched
                    ? `Força da senha: ${strengthLabel}`
                    : "Use 8+ caracteres com maiúsculas, números e símbolos."}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-pw2" className="text-[13px] font-medium">
                  Confirmar senha
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-muted-foreground">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <Input
                    id="rp-pw2"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    className="pl-9"
                    {...form.register("confirmPassword")}
                  />
                </div>
                {form.formState.errors.confirmPassword && (
                  <p className="text-[12.5px] text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-1 w-full"
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                {submitting ? "Atualizando..." : "Redefinir senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
