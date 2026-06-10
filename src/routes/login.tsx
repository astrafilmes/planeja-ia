import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/login")({ component: Login });

const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  password: z.string().min(1, "Informe sua senha"),
});

const signupSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "Informe seu nome completo")
      .max(100, "Máximo 100 caracteres"),
    email: z.string().trim().email("Informe um e-mail válido").max(255),
    password: z
      .string()
      .min(8, "Use ao menos 8 caracteres")
      .max(72, "Máximo 72 caracteres")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[a-z]/, "Inclua uma letra minúscula")
      .regex(/[0-9]/, "Inclua um número"),
    confirmPassword: z.string(),
    accept: z
      .boolean()
      .refine((v) => v === true, "Você precisa concordar com os termos"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });

const recoverSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(255),
});

type Mode = "auth" | "recover";

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("auth");
  const [showPw, setShowPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      nome: "",
      accept: false,
    },
  });
  const recoverForm = useForm<z.infer<typeof recoverSchema>>({
    resolver: zodResolver(recoverSchema),
    defaultValues: { email: "" },
  });

  const watchedPw = signupForm.watch("password");
  const strength = useMemo(() => passwordStrength(watchedPw ?? ""), [watchedPw]);
  const strengthLabel =
    ["Muito fraca", "Fraca", "Razoável", "Forte", "Excelente"][strength] ?? "";

  async function onLogin(v: z.infer<typeof loginSchema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(v);
    setSubmitting(false);
    if (error)
      return toast.error("Falha no login", { description: error.message });
    toast.success("Bem-vindo de volta");
    navigate({ to: "/dashboard" });
  }

  async function onSignup(v: z.infer<typeof signupSchema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { nome: v.nome },
      },
    });
    setSubmitting(false);
    if (error)
      return toast.error("Falha no cadastro", { description: error.message });
    toast.success("Conta criada com sucesso", {
      description:
        "Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.",
    });
  }

  async function onRecover(v: z.infer<typeof recoverSchema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(v.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error)
      return toast.error("Não foi possível enviar o e-mail", {
        description: error.message,
      });
    toast.success("Verifique seu e-mail", {
      description: "Enviamos um link para redefinir sua senha.",
    });
    setMode("auth");
  }

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-[#f6f5f1] text-slate-900 lg:grid-cols-[1.05fr_1fr] dark:bg-[#0a0d14] dark:text-slate-100">
      {/* ───── Brand panel ───── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0d14] p-12 text-slate-100 lg:flex">
        {/* layered ambient gradients */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 80% at 110% -10%, oklch(0.5 0.14 195 / 0.45) 0%, transparent 55%), radial-gradient(90% 80% at -10% 110%, oklch(0.45 0.16 260 / 0.35) 0%, transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20">
            P
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">
              Planejamento
            </div>
            <div className="text-[12px] text-slate-400">
              Contratações Públicas
            </div>
          </div>
        </div>

        <div className="relative flex max-w-lg flex-col gap-7">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300 backdrop-blur">
            <Sparkles className="size-3 text-cyan-300" /> Plataforma institucional
          </span>
          <h1
            className="text-balance text-[44px] leading-[1.05] tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Onde processos, contratos e o{" "}
            <em className="text-cyan-300">fluxo IRP</em> convergem com clareza.
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-slate-400">
            Importação automática de planilhas, geração por secretaria,
            numeração transacional e auditoria completa — em uma única
            plataforma elegante e segura.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { n: "16", l: "Unidades IRP" },
              { n: "11", l: "Secretarias" },
              { n: "100%", l: "Auditado" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 backdrop-blur"
              >
                <div
                  className="text-2xl tracking-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {s.n}
                </div>
                <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          <ul className="mt-2 grid gap-2 text-[13px] text-slate-300">
            {[
              "Integração com o portal M2A via extensão Chrome",
              "Numeração transacional por secretaria e ano",
              "Trilha de auditoria em todas as operações",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 text-cyan-300" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-[11.5px] uppercase tracking-[0.2em] text-slate-500">
          <span>© {new Date().getFullYear()} Setor de Planejamento</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-400" /> Conexão segura
          </span>
        </div>
      </aside>

      {/* ───── Form panel ───── */}
      <main className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-40"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, oklch(0.85 0.05 195 / 0.35) 0%, transparent 70%)",
          }}
        />

        <div className="mb-7 flex items-center gap-2.5 lg:hidden">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Planejamento</span>
        </div>

        <div className="w-full max-w-[440px]">
          {mode === "auth" ? (
            <>
              <header className="mb-7 text-center">
                <h2
                  className="text-[34px] leading-none tracking-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Acesse sua conta
                </h2>
                <p className="mt-2 text-[14px] text-muted-foreground">
                  Use suas credenciais institucionais para continuar.
                </p>
              </header>

              <div className="rounded-2xl border border-border/70 bg-card/80 p-1.5 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
                <Tabs defaultValue="login">
                  <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
                    <TabsTrigger value="login" className="rounded-lg">
                      Entrar
                    </TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-lg">
                      Criar conta
                    </TabsTrigger>
                  </TabsList>

                  {/* ─── Login ─── */}
                  <TabsContent value="login" className="p-5 pt-6">
                    <form
                      onSubmit={loginForm.handleSubmit(onLogin)}
                      className="flex flex-col gap-4"
                      noValidate
                    >
                      <Field
                        id="li-email"
                        label="E-mail"
                        icon={<Mail className="size-4" />}
                        error={loginForm.formState.errors.email?.message}
                      >
                        <Input
                          id="li-email"
                          type="email"
                          autoComplete="email"
                          placeholder="voce@itarema.ce.gov.br"
                          className="pl-9"
                          {...loginForm.register("email")}
                        />
                      </Field>

                      <Field
                        id="li-pw"
                        label="Senha"
                        icon={<Lock className="size-4" />}
                        trailing={
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
                        }
                        error={loginForm.formState.errors.password?.message}
                      >
                        <Input
                          id="li-pw"
                          type={showPw ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="pl-9 pr-10"
                          {...loginForm.register("password")}
                        />
                      </Field>

                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">
                          Lembrar este dispositivo
                        </span>
                        <button
                          type="button"
                          onClick={() => setMode("recover")}
                          className="font-medium text-primary hover:underline underline-offset-4"
                        >
                          Esqueci minha senha
                        </button>
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
                        {submitting ? "Autenticando..." : "Entrar"}
                      </Button>
                    </form>
                  </TabsContent>

                  {/* ─── Signup ─── */}
                  <TabsContent value="signup" className="p-5 pt-6">
                    <form
                      onSubmit={signupForm.handleSubmit(onSignup)}
                      className="flex flex-col gap-4"
                      noValidate
                    >
                      <Field
                        id="su-nome"
                        label="Nome completo"
                        icon={<User className="size-4" />}
                        error={signupForm.formState.errors.nome?.message}
                      >
                        <Input
                          id="su-nome"
                          autoComplete="name"
                          placeholder="Seu nome"
                          className="pl-9"
                          {...signupForm.register("nome")}
                        />
                      </Field>

                      <Field
                        id="su-email"
                        label="E-mail institucional"
                        icon={<Mail className="size-4" />}
                        error={signupForm.formState.errors.email?.message}
                      >
                        <Input
                          id="su-email"
                          type="email"
                          autoComplete="email"
                          placeholder="voce@itarema.ce.gov.br"
                          className="pl-9"
                          {...signupForm.register("email")}
                        />
                      </Field>

                      <Field
                        id="su-pw"
                        label="Senha"
                        icon={<Lock className="size-4" />}
                        trailing={
                          <button
                            type="button"
                            onClick={() => setShowSignupPw((v) => !v)}
                            className="absolute inset-y-0 right-2 grid place-items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label={
                              showSignupPw ? "Ocultar senha" : "Mostrar senha"
                            }
                          >
                            {showSignupPw ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        }
                        error={signupForm.formState.errors.password?.message}
                      >
                        <Input
                          id="su-pw"
                          type={showSignupPw ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Mín. 8 caracteres, com maiúscula e número"
                          className="pl-9 pr-10"
                          {...signupForm.register("password")}
                        />
                      </Field>

                      {/* Strength meter */}
                      <div className="-mt-1.5 space-y-1.5">
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
                          {watchedPw
                            ? `Força da senha: ${strengthLabel}`
                            : "Use 8+ caracteres com maiúsculas, números e símbolos."}
                        </p>
                      </div>

                      <Field
                        id="su-pw2"
                        label="Confirmar senha"
                        icon={<ShieldCheck className="size-4" />}
                        error={
                          signupForm.formState.errors.confirmPassword?.message
                        }
                      >
                        <Input
                          id="su-pw2"
                          type={showSignupPw ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Repita a senha"
                          className="pl-9"
                          {...signupForm.register("confirmPassword")}
                        />
                      </Field>

                      <label className="mt-1 flex items-start gap-2.5 text-[13px] text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border-border accent-primary"
                          {...signupForm.register("accept")}
                        />
                        <span>
                          Concordo com o uso institucional dos dados e com o
                          registro de auditoria desta plataforma.
                        </span>
                      </label>
                      {signupForm.formState.errors.accept && (
                        <p className="-mt-2 text-[12.5px] text-destructive">
                          {signupForm.formState.errors.accept.message}
                        </p>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        className="mt-1 w-full"
                        disabled={submitting}
                      >
                        {submitting && (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        )}
                        {submitting ? "Criando conta..." : "Criar conta"}
                      </Button>

                      <p className="text-center text-[12px] text-muted-foreground">
                        O primeiro usuário cadastrado vira{" "}
                        <span className="font-medium text-foreground">
                          administrador
                        </span>{" "}
                        automaticamente.
                      </p>
                    </form>
                  </TabsContent>
                </Tabs>
              </div>

              <p className="mt-6 text-center text-[12px] text-muted-foreground">
                Ao continuar, você concorda com os{" "}
                <Link to="/" className="underline-offset-4 hover:underline">
                  termos de uso institucional
                </Link>
                .
              </p>
            </>
          ) : (
            <RecoverPanel
              submitting={submitting}
              form={recoverForm}
              onSubmit={recoverForm.handleSubmit(onRecover)}
              onBack={() => setMode("auth")}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ────────────────────────── Components ────────────────────────── */

function Field({
  id,
  label,
  icon,
  trailing,
  error,
  children,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-muted-foreground">
            {icon}
          </span>
        )}
        {children}
        {trailing}
      </div>
      {error && <p className="text-[12.5px] text-destructive">{error}</p>}
    </div>
  );
}

function RecoverPanel({
  submitting,
  form,
  onSubmit,
  onBack,
}: {
  submitting: boolean;
  form: ReturnType<typeof useForm<z.infer<typeof recoverSchema>>>;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Voltar para o login
      </button>
      <header className="mb-7">
        <h2
          className="text-[34px] leading-none tracking-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Recuperar acesso
        </h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Informe seu e-mail e enviaremos um link seguro para redefinir sua
          senha.
        </p>
      </header>

      <div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field
            id="rc-email"
            label="E-mail cadastrado"
            icon={<Mail className="size-4" />}
            error={form.formState.errors.email?.message}
          >
            <Input
              id="rc-email"
              type="email"
              autoComplete="email"
              placeholder="voce@itarema.ce.gov.br"
              className="pl-9"
              {...form.register("email")}
            />
          </Field>
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>
      </div>

      <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
        Você receberá o e-mail apenas se essa conta existir.
      </p>
    </>
  );
}
