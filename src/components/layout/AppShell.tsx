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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
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
import { M2AConnectionIndicator } from "@/contexts/M2AConnectionProvider";
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
      {
        to: "/importar-contratos",
        label: "Contratos por planilha",
        icon: FileUp,
      },
      { to: "/irp", label: "IRP por secretaria", icon: FileSpreadsheet },
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
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      {visibleNav.map((entry) => {
        if ("items" in entry) {
          const GroupIcon = entry.icon;
          const activeGroup = entry.items.some(
            (item) =>
              pathname === item.to || pathname.startsWith(item.to + "/"),
          );
          const groupOpen = openGroups[entry.label] ?? activeGroup;
          const groupLabel = entry.label;

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
              className="py-1"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors
                  ${
                    activeGroup
                      ? "bg-slate-800/60 text-white"
                      : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-100"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                  title={collapsed ? groupLabel : undefined}
                >
                  <GroupIcon className="size-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 text-left">{groupLabel}</span>
                  )}
                  {!collapsed && (
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform ${
                        groupOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div
                  className={`${collapsed ? "ml-0 border-l-0 pl-0" : "ml-4 border-l border-sidebar-border pl-2"} mt-1 flex flex-col gap-1`}
                >
                  {entry.items.map(({ to, label, icon: Icon }) => {
                    const active =
                      pathname === to || pathname.startsWith(to + "/");
                    const itemLabel = label;
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={onNavigate}
                        title={collapsed ? itemLabel : undefined}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors
                        ${
                          active
                            ? "bg-sidebar-primary/15 text-sidebar-primary-foreground border-l-2 border-sidebar-primary pl-[10px]"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        } ${collapsed ? "justify-center px-2" : ""}`}
                      >
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && itemLabel}
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
        const itemLabel = label;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            title={collapsed ? itemLabel : undefined}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors
              ${
                active
                  ? "bg-sidebar-primary/15 text-sidebar-primary-foreground border-l-2 border-sidebar-primary pl-[10px]"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              } ${collapsed ? "justify-center px-2" : ""}`}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && itemLabel}
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
  const { user, loading, signOut, isGestor, roles } = useAuth();
  const navigate = useNavigate();
  const router = useRouterState();
  const pathname = router.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    <div className="border-b border-sidebar-border px-3 py-4">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          P
        </div>
        {!compact && (
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight leading-tight">
              Planejamento
            </div>
            <div className="text-[11px] leading-tight text-sidebar-foreground/60">
              Contratações Públicas
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderUserBlock = (compact = false) => (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar className="size-8">
          <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary-foreground text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!compact && (
          <div className="flex-1 min-w-0">
            <div className="truncate text-xs font-medium">{user.email}</div>
            <div className="text-[11px] text-sidebar-foreground/60">
              {roles[0] ?? "operador"}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
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
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950 dark:bg-[#0B0F19] dark:text-slate-50">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-800/60 bg-[#0B0F19] text-slate-100 transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-[72px]" : "w-64"
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
        <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800/60 dark:bg-[#0B0F19]/90">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
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
                  className="flex w-72 flex-col border-slate-800/60 bg-[#0B0F19] p-0 text-slate-100"
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
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <M2AConnectionIndicator />
              <ThemeToggle />
              <Button
                size="sm"
                variant="outline"
                className="hidden gap-2 sm:inline-flex"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-3.5" /> Buscar
                <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-400 md:inline-flex">
                  CmdK
                </kbd>
              </Button>
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
          <Separator className="bg-slate-200 dark:bg-slate-800/60" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
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
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800/60 dark:bg-[#0B0F19] dark:text-slate-400">
          <div className="flex items-center justify-end gap-3 font-mono">
            <span>SITE {siteVersion}</span>
            <span>EXTENSÃO {extensionVersion}</span>
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
