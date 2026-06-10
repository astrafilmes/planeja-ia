import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/login")({ component: Login });

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
const signupSchema = loginSchema.extend({
  nome: z.string().trim().min(2, "Informe seu nome").max(100),
});

function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", nome: "" },
  });

  async function onLogin(v: z.infer<typeof loginSchema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(v);
    setSubmitting(false);
    if (error)
      return toast.error("Falha no login", { description: error.message });
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  }
  async function onSignup(v: z.infer<typeof signupSchema>) {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome: v.nome },
      },
    });
    setSubmitting(false);
    if (error)
      return toast.error("Falha no cadastro", { description: error.message });
    toast.success("Conta criada", {
      description: "Verifique seu e-mail se a confirmação estiver ativa.",
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-50 dark:bg-[#0B0F19] lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-800/60 bg-[#0B0F19] p-12 text-slate-100 lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">
              P
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">
                Planejamento
              </div>
              <div className="text-[13px] text-slate-400">
                Contratações Públicas
              </div>
            </div>
          </div>
        </div>
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Centralize processos, contratos e o fluxo IRP em uma única
            plataforma.
          </h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Importação automática de planilhas, geração por secretaria,
            numeração transacional, histórico completo e auditoria de todas as
            operações.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { n: "16", l: "Unidades IRP" },
              { n: "11", l: "Secretarias" },
              { n: "100%", l: "Auditado" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5"
              >
                <div className="text-xl font-semibold">{s.n}</div>
                <div className="mt-0.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-slate-500">
          {new Date().getFullYear()} Setor de Planejamento
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-6 py-10">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <Building2 className="size-5 text-primary" />
          <span className="font-semibold">Planejamento</span>
        </div>
        <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Acesse sua conta</CardTitle>
            <CardDescription>
              Use suas credenciais institucionais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="pt-4">
                <form
                  onSubmit={loginForm.handleSubmit(onLogin)}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="li-email">E-mail</Label>
                    <Input
                      id="li-email"
                      type="email"
                      autoComplete="email"
                      {...loginForm.register("email")}
                    />
                    {loginForm.formState.errors.email && (
                      <p className="text-[13px] text-destructive">
                        {loginForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="li-pw">Senha</Label>
                    <Input
                      id="li-pw"
                      type="password"
                      autoComplete="current-password"
                      {...loginForm.register("password")}
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-[13px] text-destructive">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="pt-4">
                <form
                  onSubmit={signupForm.handleSubmit(onSignup)}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="su-nome">Nome completo</Label>
                    <Input id="su-nome" {...signupForm.register("nome")} />
                    {signupForm.formState.errors.nome && (
                      <p className="text-[13px] text-destructive">
                        {signupForm.formState.errors.nome.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="su-email">E-mail</Label>
                    <Input
                      id="su-email"
                      type="email"
                      {...signupForm.register("email")}
                    />
                    {signupForm.formState.errors.email && (
                      <p className="text-[13px] text-destructive">
                        {signupForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="su-pw">Senha</Label>
                    <Input
                      id="su-pw"
                      type="password"
                      {...signupForm.register("password")}
                    />
                    {signupForm.formState.errors.password && (
                      <p className="text-[13px] text-destructive">
                        {signupForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? "Criando..." : "Criar conta"}
                  </Button>
                  <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
                    O primeiro usuário cadastrado vira administrador
                    automaticamente.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
