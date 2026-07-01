import { createFileRoute } from"@tanstack/react-router";
import { routeHead } from"@/lib/utils/route-head";
import { useQuery } from"@tanstack/react-query";
import { AppShell } from"@/components/layout/AppShell";
import { EmptyState } from"@/components/layout/EmptyState";
import { supabase } from"@/integrations/supabase/client";
import { Card } from"@/components/ui/card";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from"@/components/ui/table";
import { Badge } from"@/components/ui/badge";
import { ScrollText } from"lucide-react";

export const Route = createFileRoute("/logs")({
 component: Page,
 head: () =>
 routeHead({
 path:"/logs",
 title:"Logs",
 description:"Logs de auditoria e operações realizadas pelos usuários no Planeja IA.",
 noindex: true,
 }),
});

function Page() {
 const { data, isLoading } = useQuery({
 queryKey: ["audit"],
 queryFn: async () =>
 (
 await supabase
 .from("audit_logs")
 .select("*")
 .order("created_at", { ascending: false })
 .limit(200)
 ).data ?? [],
 });
 return (
 <AppShell
 title="Auditoria"
 subtitle="Ações realizadas no sistema (somente gestores e administradores)"
 >
 <Card className="overflow-hidden border-border/60">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-44">Quando</TableHead>
 <TableHead className="w-40">Ação</TableHead>
 <TableHead className="w-32">Entidade</TableHead>
 <TableHead>Payload</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {isLoading && (
 <TableRow>
 <TableCell
 colSpan={4}
 className="py-8 text-center text-[13px] text-muted-foreground"
 >
 Carregando...
 </TableCell>
 </TableRow>
 )}
 {!isLoading && (data?.length ?? 0) === 0 && (
 <TableRow>
 <TableCell colSpan={4}>
 <EmptyState
 icon={ScrollText}
 title="Sem registros de auditoria"
 description="As ações sensíveis realizadas no sistema aparecerão aqui."
 />
 </TableCell>
 </TableRow>
 )}
 {data?.map((l: any) => (
 <TableRow key={l.id}>
 <TableCell className="text-xs text-muted-foreground">
 {new Date(l.created_at).toLocaleString("pt-BR")}
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className="font-mono text-[10px]">
 {l.action}
 </Badge>
 </TableCell>
 <TableCell className="text-xs">{l.entity_type}</TableCell>
 <TableCell className="max-w-xl truncate font-mono text-[11px] text-muted-foreground">
 {JSON.stringify(l.request_payload)}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </Card>
 </AppShell>
 );
}
