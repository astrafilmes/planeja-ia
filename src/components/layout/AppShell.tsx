import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  FileText,
  FileSignature,
  FileSpreadsheet,
  History,
  ScrollText,
  LogOut,
  Hash,
  ChevronRight,
  ChevronDown,
  FileUp,
  Menu,
  Search,
  Users,
  UserCheck,
  HandCoins,
  ClipboardList,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { exportFullSystem, setupDailyBackup } from "@/lib/system-export";

import { PageHeader } from "@/components/layout/PageHeader";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;

const nav: NavEntry[] = [
  {
    label: "Operação",
    icon: LayoutDashboard,
    items: [
      { to: "/dashboard", label: "Painel geral", icon: LayoutDashboard },
      { to: "/processos", label: "Processos", icon: FileText },
      { to: "/contratos", label: "Contratos", icon: FileSignature },
    ],
  },
  {
    label: "Importação",
    icon: FileUp,
    items: [
      { to: "/irp", label: "Importação de Processos", icon: FileSpreadsheet },
      {
        to: "/importar-contratos",
        label: "Importação de Contratos",
        icon: FileUp,
      },
      { to: "/historico", label: "Histórico", icon: History },
    ],
  },
  {
    label: "Cadastros",
    icon: ClipboardList,
    items: [
      { to: "/secretarias", label: "Secretarias", icon: Building2 },
      { to: "/fornecedores", label: "Fornecedores", icon: HandCoins },
      { to: "/fiscais", label: "Fiscais", icon: UserCheck },
      { to: "/gestores", label: "Gestores", icon: Users },
    ],
  },
  {
    label: "Sistema",
    icon: ScrollText,
    items: [
      { to: "/numeracao", label: "Numeração", icon: Hash },
      { to: "/logs", label: "Auditoria", icon: ScrollText, adminOnly: true },
    ],
  },
];

// Suppress unused-import lint while keeping API stable
void ChevronRight;
void Separator;

function NavList({
  pathname,
  isGestor,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  isGestor: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const visibleNav = nav
    .map((entry) => {
      if ("items" in entry) {
        return {
          ...entry,
          items: entry.items.filter((item) => !item.adminOnly || isGestor),
        };
      }
      return entry;
    })
    .filter((entry) => {
      if ("items" in entry) return entry.items.length > 0;
      return !entry.adminOnly || isGestor;
    });
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {visibleNav.map((entry) => {
        if ("items" in entry) {
          const GroupIcon = entry.icon;
          const activeGroup = entry.items.some(
            (item) =>
              pathname === item.to || pathname.startsWith(item.to + "/"),
          );
          const groupOpen = openGroups[entry.label] ?? activeGroup;
          const groupLabel = entry.label;

          if (collapsed) {
            // Compact: render icons only, flat list
            return (
              <div key={entry.label} className="flex flex-col gap-1">
                {entry.items.map(({ to, label, icon: Icon }) => {
                  const active =
                    pathname === to || pathname.startsWith(to + "/");
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={onNavigate}
                      title={label}
                      className={`group relative flex h-10 items-center justify-center rounded-lg border transition-colors
                        ${
                          active
                            ? "border-sidebar-border bg-sidebar-accent/60 text-sidebar-accent-foreground"
                            : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                        }`}
                    >
                      <Icon className="size-[18px]" />
                    </Link>
                  );
                })}
              </div>
            );
          }

          return (
            <Collapsible
              key={entry.label}
              open={groupOpen}
              onOpenChange={(value) =>
                setOpenGroups((current) => ({
                  ...current,
                  [entry.label]: value,
                }))
              }
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/30"
                >
                  <GroupIcon className="size-4 shrink-0 text-sidebar-foreground/70" />
                  <span className="flex-1 text-left">{groupLabel}</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 text-sidebar-foreground/50 transition-transform ${
                      groupOpen ? "rotate-0" : "-rotate-90"
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-[14px] mt-1 flex flex-col gap-0.5 border-l border-sidebar-border/70 pl-2">
                  {entry.items.map(({ to, label, icon: Icon }) => {
                    const active =
                      pathname === to || pathname.startsWith(to + "/");
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={onNavigate}
                        className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal transition-colors
                          ${
                            active
                              ? "bg-sidebar-accent/60 text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                          }`}
                      >
                        <Icon
                          className={`size-[15px] shrink-0 transition-colors ${
                            active
                              ? "text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70"
                          }`}
                        />
                        <span className="truncate">{label}</span>
                        {active && (
                          <span className="ml-auto size-1.5 rounded-full bg-sidebar-accent-foreground/70" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        }

        const { to, label, icon: Icon } = entry;
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors
              ${
                active
                  ? "border-sidebar-border bg-sidebar-accent/60 text-sidebar-accent-foreground"
                  : "border-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
              } ${collapsed ? "justify-center px-2" : ""}`}
          >
            <Icon className="size-[17px] shrink-0" />
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  onBack,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  const { user, loading, signOut, isGestor, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const router = useRouterState();
  const pathname = router.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exportingSystem, setExportingSystem] = useState(false);
  const [exportStep, setExportStep] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Backup automático no startup foi removido: agora roda apenas via botão
  // de exportar ou via agendamento diário (cron) no backend.

  async function handleExportSystem() {
    if (!isGestor) {
      toast.error("Exportação restrita", {
        description: "Apenas gestores e administradores podem exportar o banco completo.",
      });
      return;
    }
    setExportingSystem(true);
    setExportStep("Iniciando...");
    const toastId = toast.loading("Exportando sistema...", {
      description: "Coletando dados em prioridade (base → processos → contratos → m2a → logs)",
    });
    try {
      const result = await exportFullSystem((step, current, total) => {
        setExportStep(`${step} (${current}/${total})`);
        toast.loading(`Exportando sistema (${current}/${total})`, {
          id: toastId,
          description: step,
        });
      });
      toast.success("Exportação concluída", {
        id: toastId,
        description: `${result.files} arquivos${result.databaseIncluded ? " + banco" : ""}${result.warnings.length ? ` (${result.warnings.length} aviso(s))` : ""}.`,
      });
    } catch (error) {
      toast.error("Falha ao exportar sistema", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExportingSystem(false);
      setExportStep(null);
    }
  }

  async function handleSetupDailyBackup() {
    try {
      await setupDailyBackup();
      toast.success("Backup diário agendado", {
        description: "Será executado todos os dias às 23:55 (UTC).",
      });
    } catch (error) {
      toast.error("Falha ao agendar backup diário", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const initials = (user.email ?? "U").slice(0, 2).toUpperCase();
  const siteVersion = __APP_VERSION__;
  const extensionVersion = __EXT_VERSION__;

  const renderBrand = (compact = false) => (
    <div className="px-4 pb-3 pt-5">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-sm font-bold text-sidebar-accent-foreground">
          P
        </div>
        {!compact && (
          <div className="min-w-0">
            <div className="text-[15px] font-bold tracking-tight leading-tight text-sidebar-foreground">
              PLANEJA-IA
            </div>
            <div className="text-[11px] leading-tight text-sidebar-foreground/55">
              Contratações Públicas
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderUserBlock = (compact = false) => (
    <div className="mx-3 mb-3 mt-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-2">
      <div className="flex items-center gap-2.5">
        <Avatar className="size-9">
          <AvatarFallback className="bg-gradient-to-br from-accent to-accent-strong text-[11px] font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!compact && (
          <div className="flex-1 min-w-0">
            <div className="truncate text-[12px] font-semibold text-sidebar-foreground">
              {user.email}
            </div>
            <div className="text-[10.5px] uppercase tracking-wider text-sidebar-foreground/55">
              {roles[0] ?? "operador"}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => signOut()}
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span className="sr-only">Sair</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-[78px]" : "w-[260px]"
        }`}
      >
        {renderBrand(sidebarCollapsed)}
        <NavList
          pathname={pathname}
          isGestor={isGestor}
          collapsed={sidebarCollapsed}
        />
        {renderUserBlock(sidebarCollapsed)}
      </aside>

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                size="icon"
                variant="ghost"
                className="hidden size-9 md:inline-flex"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label="Recolher menu"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="md:hidden size-9"
                    aria-label="Abrir menu"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
                >
                  <VisuallyHidden>
                    <SheetTitle>Menu de navegação</SheetTitle>
                  </VisuallyHidden>
                  {renderBrand(false)}
                  <NavList
                    pathname={pathname}
                    isGestor={isGestor}
                    onNavigate={() => setMobileOpen(false)}
                  />
                  {renderUserBlock(false)}
                </SheetContent>
              </Sheet>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3.5 text-[13px] text-muted-foreground transition-all hover:border-border hover:bg-muted hover:text-foreground sm:inline-flex"
              >
                <Search className="size-3.5" />
                <span>Buscar processos, contratos…</span>
                <kbd className="ml-2 hidden h-5 select-none items-center gap-0.5 rounded-md border border-border/70 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
                  ⌘K
                </kbd>
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <ThemeToggle />
              <Button
                size="icon"
                variant="ghost"
                className="sm:hidden size-9"
                onClick={() => setPaletteOpen(true)}
                aria-label="Buscar"
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-6 lg:px-8 lg:py-8">
          {(title || subtitle || actions) && (
            <PageHeader
              title={title ?? ""}
              subtitle={subtitle}
              primaryAction={actions}
              onBack={onBack}
            />
          )}
          {children}
        </div>
        <footer className="shrink-0 border-t border-border/60 bg-background/80 px-5 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportSystem}
                disabled={exportingSystem}
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[10.5px] font-medium opacity-70 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 disabled:pointer-events-none disabled:opacity-45"
                title="Exportar projeto, migrações, relatório e backup do banco"
              >
                <Download className="size-3" aria-hidden="true" />
                <span>{exportingSystem ? (exportStep ?? "Exportando...") : "Exportar sistema"}</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSetupDailyBackup}
                  className="inline-flex h-6 items-center rounded-md px-1.5 text-[10.5px] font-medium opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100"
                  title="Agendar backup automático diário (23:55 UTC) — substitui o arquivo anterior no bucket system-backups"
                >
                  Agendar backup diário
                </button>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 font-mono">
            <span>SITE {siteVersion}</span>
            <span>WORKER {extensionVersion}</span>
            </div>
          </div>
        </footer>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: any; label: string }> = {
    rascunho: { v: "secondary", label: "Rascunho" },
    em_andamento: { v: "default", label: "Em andamento" },
    concluido: { v: "default", label: "Concluído" },
    cancelado: { v: "destructive", label: "Cancelado" },
    arquivado: { v: "outline", label: "Arquivado" },
    ativo: { v: "default", label: "Ativo" },
    encerrado: { v: "outline", label: "Encerrado" },
    exportado: { v: "default", label: "Exportado" },
    pendente: { v: "secondary", label: "Pendente" },
    sem_itens: { v: "outline", label: "Sem itens" },
    erro: { v: "destructive", label: "Erro" },
    completed: { v: "default", label: "Completo" },
    uploaded: { v: "secondary", label: "Enviado" },
    analyzed: { v: "secondary", label: "Analisado" },
    failed: { v: "destructive", label: "Falhou" },
  };
  const it = map[status] ?? { v: "outline", label: status };
  return <Badge variant={it.v}>{it.label}</Badge>;
}
