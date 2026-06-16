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
import { M2A_ORGAOS_MAPPING } from "@/lib/m2a-orgaos-mapping";

export const Route = createFileRoute("/irp-colunas")({
  head: () =>
    routeHead({
      title: "Mapeamento de Colunas IRP",
      description:
        "Relação entre cada coluna da planilha de importação IRP e a respectiva Unidade Orçamentária no M2A.",
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

// Mapeamento atual carregado de irp_unidades_processamento + M2A_ORGAOS_MAPPING.
// ref_coluna é zero-based (coluna 0 = A).
const LINHAS: Linha[] = [
  { refColuna: 9,  secretariaPlanilha: "SEC. MUN. DE ADMINISTRAÇÃO, FINANÇAS E PLANEJAMENTO", orgaoId: "10023", uoId: 12897, uoNome: "Secretaria Municipal de Administração, Finanças e Planejamento", responsavel: "Ana Soraya" },
  { refColuna: 11, secretariaPlanilha: "CONTROLADORIA GERAL DO MUNICÍPIO",                       orgaoId: "10006", uoId: 12877, uoNome: "Controladoria Geral do Município",                                  responsavel: "Ana Soraya" },
  { refColuna: 13, secretariaPlanilha: "SEC. MUN. DE TURISMO E CULTURA",                          orgaoId: "11291", uoId: 14718, uoNome: "Secretaria Municipal de Cultura e Turismo",                         responsavel: "Ana Soraya" },
  { refColuna: 15, secretariaPlanilha: "SEC. MUN. DE DESENVOLVIMENTO RURAL E PESCA (SDRP)",       orgaoId: "10025", uoId: 12899, uoNome: "Secretaria Municipal de Desenvolvimento Rural e Pesca",            responsavel: "Ana Soraya" },
  { refColuna: 17, secretariaPlanilha: "SEC. MUN. DE ESPORTE, JUVENTUDE E LAZER",                 orgaoId: "10026", uoId: 12901, uoNome: "Secretaria Municipal de Esporte, Juventude e Lazer",              responsavel: "Ana Soraya" },
  { refColuna: 19, secretariaPlanilha: "PREVIDÊNCIA",                                             orgaoId: "10030", uoId: 12912, uoNome: "Fundo de Previdência Social do Município de Itarema",              responsavel: "Ana Soraya" },
  { refColuna: 21, secretariaPlanilha: "GABINETE DO PREFEITO",                                    orgaoId: "10022", uoId: 14712, uoNome: "Gabinete do Prefeito",                                              responsavel: "Ana Soraya" },
  { refColuna: 23, secretariaPlanilha: "SEC. MUN. DE INFRAESTRUTURA, MOBILIDADE E SERV. PÚBLICOS", orgaoId: "10024", uoId: 12898, uoNome: "Secretaria Municipal de Infraestrutura, Mobilidade e Serviços Públicos", responsavel: "Hawlyson" },
  { refColuna: 25, secretariaPlanilha: "SEC. MUN. DE MEIO AMBIENTE",                              orgaoId: "10031", uoId: 12913, uoNome: "Secretaria Municipal de Meio Ambiente",                            responsavel: "Ana Soraya" },
  { refColuna: 27, secretariaPlanilha: "SEC. MUN. DA EDUCAÇÃO — SEC",                             orgaoId: "10027", uoId: 12902, uoNome: "Secretaria Municipal de Educação",                                 responsavel: "Lorena" },
  { refColuna: 30, secretariaPlanilha: "SEC. MUN. DA EDUCAÇÃO — FUNDEB",                          orgaoId: "10027", uoId: 12904, uoNome: "FUNDEB",                                                           responsavel: "Lorena" },
  { refColuna: 33, secretariaPlanilha: "SEC. MUN. DA SAÚDE — SEC",                                orgaoId: "10028", uoId: 12905, uoNome: "Secretaria Municipal de Saúde",                                   responsavel: "Francisco" },
  { refColuna: 35, secretariaPlanilha: "SEC. MUN. DA SAÚDE — HOSPITAL",                           orgaoId: "10028", uoId: 12907, uoNome: "Hospital Municipal de Itarema - Natércia Rios",                  responsavel: "Francisco" },
  { refColuna: 40, secretariaPlanilha: "SEC. MUN. DA SAÚDE — FMS",                                orgaoId: "10028", uoId: 12906, uoNome: "Fundo Municipal de Saúde",                                        responsavel: "Francisco" },
  { refColuna: 43, secretariaPlanilha: "SEC. MUN. DE PROTEÇÃO SOCIAL E CIDADANIA — SEC",          orgaoId: "10029", uoId: 12908, uoNome: "Secretaria Municipal de Proteção Social e Cidadania",            responsavel: "Leide" },
  { refColuna: 49, secretariaPlanilha: "SEC. MUN. DE PROTEÇÃO SOCIAL E CIDADANIA — FUNDO ASSISTÊNCIA", orgaoId: "10029", uoId: 12909, uoNome: "Fundo Municipal de Assistência Social",                      responsavel: "Leide" },
];

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
