import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportarRelatorioContratoExcel, ContractGroupedData, ContractReportData, groupContractData } from "@/lib/excel-export";

// Helper function to add a single contract's data to a jsPDF document
// Mirrors EXACTLY the XLSX export (exportarRelatorioContratoExcel):
// - Same header rows (Tipo, Nº Contrato, Secretaria, Fornecedor, Objeto, Dotação, Data de Criação)
// - Same table columns (Ordem, Lote, Descrição=especificação, Especificação=descricao, Unidade, Qtd, Vlr Unit, Vlr Total)
const addContractToPdf = (contract: ContractGroupedData, doc: jsPDF, startY: number): number => {
  let currentY = startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxTextWidth = pageWidth - margin * 2;

  const h = contract.header;
  const secretariaTxt = h.secretaria_sigla
    ? `${h.secretaria_nome || ''} (${h.secretaria_sigla})`
    : (h.secretaria_nome || '');

  const headerRows: Array<[string, string]> = [
    ['Tipo de Relatório:', 'Relatório de Contrato'],
    ['Número do Contrato:', h.numero_contrato || ''],
    ['Secretaria:', secretariaTxt],
    ['Fornecedor:', h.fornecedor_nome || ''],
    ['Objeto:', h.objeto || ''],
    ['Dotação:', h.dotacao || ''],
    ['Data de Criação:', h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : ''],
  ];

  doc.setFontSize(10);
  for (const [label, value] of headerRows) {
    const labelW = 42;
    doc.setFont(undefined as any, 'bold');
    doc.text(label, margin, currentY);
    doc.setFont(undefined as any, 'normal');
    const wrapped = doc.splitTextToSize(value || '', maxTextWidth - labelW);
    doc.text(wrapped, margin + labelW, currentY);
    currentY += Math.max(5, wrapped.length * 5);
  }
  currentY += 4;

  // Items table — same column order/labels as XLSX
  autoTable(doc, {
    startY: currentY,
    head: [['Ordem', 'Lote', 'Descrição', 'Especificação', 'Unidade', 'Quantidade', 'Valor Unitário', 'Valor Total']],
    body: contract.items.map(item => [
      item.item_ordem ?? '',
      item.item_lote ?? '',
      (item.item_especificacao || '').toUpperCase(),
      (item.item_descricao || '').toUpperCase(),
      item.item_unidade || '',
      formatNumber(item.item_quantidade || 0),
      formatBRL(item.item_valor_unitario || 0),
      formatBRL(item.item_valor_total || 0),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], halign: 'center' },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 60 },
      3: { cellWidth: 60 },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
    didDrawPage: (data: any) => {
      doc.setFontSize(8);
      doc.text(`Página ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
    }
  });

  // Update currentY to be after the table
  currentY = (doc as any).lastAutoTable.finalY + 10;
  return currentY;
};

interface ContractReportGeneratorProps {
  contractIds: string[];
  isBatch?: boolean;
  buttonClassName?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ContractReportGenerator({ contractIds, isBatch = false, buttonClassName, variant = "outline", size = "sm" }: ContractReportGeneratorProps) {
  const [loadingXls, setLoadingXls] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const fetchData = async (): Promise<ContractGroupedData[]> => {
    try {
      let data: ContractReportData[] | null = null;
      let error: any = null;

      if (isBatch) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_multiple_contracts_report_data' as any, { p_contract_ids: contractIds });
        data = rpcData as any;
        error = rpcError;
      } else {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_contract_report_data' as any, { p_contract_id: contractIds[0] });
        data = rpcData as any;
        error = rpcError;
      }

      if (error) {
        throw error;
      }
      if (!data || data.length === 0) {
        toast.info("Nenhum dado encontrado para os contratos selecionados.");
        return [];
      }

      return groupContractData(data);
    } catch (e: any) {
      toast.error("Erro ao buscar dados do contrato", { description: e.message });
      return [];
    }
  };

  const handleGenerateXls = async () => {
    setLoadingXls(true);
    const contracts = await fetchData();
    if (contracts.length === 0) {
      setLoadingXls(false);
      return;
    }

    try {
      await exportarRelatorioContratoExcel(contracts, isBatch);
      toast.success(`Relatório Excel gerado com sucesso!`);
    } catch (e: any) {
      toast.error("Erro ao exportar Excel", { description: e.message });
    } finally {
      setLoadingXls(false);
    }
  };

  const handleGeneratePdf = async () => {
    setLoadingPdf(true);
    const contracts = await fetchData();
    if (contracts.length === 0) {
      setLoadingPdf(false);
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let currentY = 14;

    contracts.forEach((contract, index) => {
      if (index > 0) {
        doc.addPage();
        currentY = 14;
      }
      currentY = addContractToPdf(contract, doc, currentY);
    });

    const fileName = isBatch 
      ? `contratos_relatorio_lote_${new Date().toISOString().slice(0, 10)}.pdf`
      : `contrato_${contracts[0].header.numero_contrato?.replace(/[\\/*?:[\]]/g, '_') || 'relatorio'}.pdf`;

    doc.save(fileName);
    toast.success("Relatório PDF gerado com sucesso!");
    setLoadingPdf(false);
  };

  return (
    <>
      <Button onClick={handleGenerateXls} disabled={loadingXls || loadingPdf || contractIds.length === 0} className={buttonClassName} variant={variant} size={size}>
        {loadingXls ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
        Exportar XLSX
      </Button>
      <Button onClick={handleGeneratePdf} disabled={loadingXls || loadingPdf || contractIds.length === 0} className={buttonClassName} variant={variant} size={size}>
        {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
        Exportar PDF
      </Button>
    </>
  );
}
