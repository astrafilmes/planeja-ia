import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  FileText,
  FileSignature,
  FileSpreadsheet,
  History,
  Building2,
  Hash,
  ScrollText,
  FileUp,
  Users,
  UserCheck,
} from "lucide-react";

const STATIC_PAGES = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/processos", label: "Processos", icon: FileText },
  { to: "/contratos", label: "Contratos", icon: FileSignature },
  { to: "/importar-contratos", label: "Importar contratos", icon: FileUp },
  { to: "/irp", label: "Importação IRP", icon: FileSpreadsheet },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/secretarias", label: "Secretarias", icon: Building2 },
  { to: "/fiscais", label: "Fiscais", icon: UserCheck },
  { to: "/gestores", label: "Gestores", icon: Users },
  { to: "/numeracao", label: "Numeração", icon: Hash },
  { to: "/logs", label: "Auditoria", icon: ScrollText },
];

type Hit = {
  kind: "contrato" | "processo" | "secretaria";
  id: string;
  title: string;
  subtitle?: string;
};

function sanitizeSearchTerm(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    const term = sanitizeSearchTerm(query);
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const like = `%${term}%`;
      const [contratos, processos, secretarias] = await Promise.all([
        supabase
          .from("contratos")
          .select("id, numero_contrato, objeto, secretaria_sigla")
          .or(
            `numero_contrato.ilike.${like},objeto.ilike.${like},preposto.ilike.${like}`,
          )
          .is("deleted_at", null)
          .limit(6),
        supabase
          .from("processos")
          .select("id, numero_processo, objeto")
          .or(`numero_processo.ilike.${like},objeto.ilike.${like}`)
          .is("deleted_at", null)
          .limit(6),
        supabase
          .from("secretarias")
          .select("id, sigla, nome, numero")
          .or(`sigla.ilike.${like},nome.ilike.${like}`)
          .limit(6),
      ]);
      if (!active) return;
      const out: Hit[] = [];
      for (const c of contratos.data ?? [])
        out.push({
          kind: "contrato",
          id: c.id,
          title: c.numero_contrato,
          subtitle: `${c.secretaria_sigla} · ${c.objeto?.slice(0, 80) ?? ""}`,
        });
      for (const p of processos.data ?? [])
        out.push({
          kind: "processo",
          id: p.id,
          title: p.numero_processo ?? "(sem nº)",
          subtitle: p.objeto?.slice(0, 80),
        });
      for (const s of secretarias.data ?? [])
        out.push({
          kind: "secretaria",
          id: s.id,
          title: `${s.sigla} — ${s.nome}`,
          subtitle: `#${s.numero}`,
        });
      setHits(out);
      setLoading(false);
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function go(to: string, params?: any) {
    onOpenChange(false);
    navigate({ to, params } as any);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar contratos, processos, secretarias…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loading
            ? "Buscando…"
            : query.length < 2
              ? "Digite ao menos 2 caracteres"
              : "Nenhum resultado."}
        </CommandEmpty>

        {hits.length > 0 && (
          <CommandGroup heading="Resultados">
            {hits.map((h) => (
              <CommandItem
                key={`${h.kind}-${h.id}`}
                value={`${h.kind} ${h.title} ${h.subtitle ?? ""}`}
                onSelect={() => {
                  if (h.kind === "contrato") go("/contratos/$id", { id: h.id });
                  else if (h.kind === "processo")
                    go("/processos/$id", { id: h.id });
                  else go("/secretarias");
                }}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-20">
                  {h.kind}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate">{h.title}</span>
                  {h.subtitle && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {h.subtitle}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Páginas">
          {STATIC_PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem key={p.to} value={p.label} onSelect={() => go(p.to)}>
                <Icon className="size-4" /> {p.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
