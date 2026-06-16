import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "@/lib/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { M2A_IRP_UNIDADES_CANONICAS, M2A_ORGAOS_MAPPING } from "@/lib/m2a-orgaos-mapping";

export const Route = createFileRoute("/irp-colunas")({
  head: () =>
    routeHead({
      path: "/irp-colunas",
      title: "Mapeamento de Colunas IRP",
      description:
        "Relação entre cada coluna da planilha de importação IRP e a respectiva Unidade Orçamentária no M2A.",
      noindex: true,
    }),
  component: IrpColunasPage,
});

function colLetter(n: number): string {
  // n é zero-based: 0 -> A, 25 -> Z, 26 -> AA
  let s = "";
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode((x % 26) + 65) + s;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

interface Linha {
  refColuna: number; // zero-based
  secretariaPlanilha: string;
  orgaoId: string;
  uoId: number;
  uoNome: string;
  responsavel: string;
}

const LINHAS: Linha[] = M2A_IRP_UNIDADES_CANONICAS.map((u) => ({
  refColuna: u.refColuna,
  secretariaPlanilha: u.nomePlanilha,
  orgaoId: u.orgaoId,
  uoId: Number(u.uoId),
  uoNome: u.uoNome,
  responsavel: M2A_ORGAOS_MAPPING[u.orgaoId]?.responsavel_dfd_nome.split(" ")[0] ?? "",
}));

function IrpColunasPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Mapeamento de Colunas IRP → Unidade Orçamentária
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada coluna da planilha de importação por IRP é processada como uma
            secretaria/unidade independente. A tabela abaixo mostra a coluna
            (índice zero-based e letra Excel) e a UO correspondente no portal
            M2A, conforme o cadastro em <code>irp_unidades_processamento</code> e
            <code> M2A_ORGAOS_MAPPING</code>.
          </p>
        </header>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Coluna</TableHead>
                <TableHead className="w-20">Letra</TableHead>
                <TableHead>Secretaria (planilha)</TableHead>
                <TableHead>Unidade Orçamentária (M2A)</TableHead>
                <TableHead className="w-28">UO ID</TableHead>
                <TableHead className="w-28">Órgão ID</TableHead>
                <TableHead className="w-32">Responsável DFD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LINHAS.map((l) => {
                const orgao = M2A_ORGAOS_MAPPING[l.orgaoId];
                return (
                  <TableRow key={l.refColuna}>
                    <TableCell className="font-mono">{l.refColuna}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {colLetter(l.refColuna)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.secretariaPlanilha}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {l.uoNome}
                      {orgao && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {orgao.nome}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.uoId}</TableCell>
                    <TableCell className="font-mono text-xs">{l.orgaoId}</TableCell>
                    <TableCell className="text-xs">{l.responsavel}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Total: {LINHAS.length} colunas mapeadas. Para alterar, edite a tabela
          <code> irp_unidades_processamento</code> (campo <code>ref_coluna</code>)
          ou o arquivo <code>src/lib/m2a-orgaos-mapping.ts</code>.
        </p>
      </div>
    </AppShell>
  );
}
