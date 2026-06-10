import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { formatBRL, formatNumber } from "@/lib/normalize";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportarRelatorioContratoExcel, ContractGroupedData, ContractReportData, groupContractData } from "@/lib/excel-export";

// Helper function to add a single contract's data to a jsPDF document
const addContractToPdf = (contract: ContractGroupedData, doc: jsPDF, startY: number): number => {
  let currentY = startY;

  doc.setFontSize(14);
  doc.text(`Contrato: ${contract.header.numero_contrato || 'S/N'}`, 14, currentY);
  currentY += 7;

  doc.setFontSize(10);
  doc.text(`Secretaria: ${contract.header.secretaria_nome || ''} (${contract.header.secretaria_sigla || ''})`, 14, currentY);
  currentY += 5;
  
  // Handling long text for fornecedor and objeto
  const fornecedorText = doc.splitTextToSize(`Fornecedor: ${contract.header.fornecedor_nome || ''}`, 180);
  doc.text(fornecedorText, 14, currentY);
  currentY += (fornecedorText.length * 5);
  
  const objetoText = doc.splitTextToSize(`Objeto: ${contract.header.objeto || ''}`, 180);
  doc.text(objetoText, 14, currentY);
  currentY += (objetoText.length * 5);

  doc.text(`Preposto: ${contract.header.preposto || ''}`, 14, currentY);
  currentY += 5;
  doc.text(`Fiscal: ${contract.header.fiscal || ''}`, 14, currentY);
  currentY += 5;
  doc.text(`Dotação: ${contract.header.dotacao || ''}`, 14, currentY);
  currentY += 5;
  doc.text(`ATA M2A: ${contract.header.m2a_ata_numero || ''}`, 14, currentY);
  currentY += 5;
  doc.text(`Data de Criação: ${contract.header.created_at ? new Date(contract.header.created_at).toLocaleDateString('pt-BR') : ''}`, 14, currentY);
  currentY += 10; // Space before table

  // Items table
  autoTable(doc, {
    startY: currentY,
    head: [['Ordem', 'Nº Item', 'Lote', 'Descrição', 'Unid.', 'Qtd.', 'Vlr Unit.', 'Vlr Total']],
    body: contract.items.map(item => [
      item.item_ordem || '',
      item.item_numero || '',
      item.item_lote || '',
      item.item_descricao || '',
      item.item_unidade || '',
      formatNumber(item.item_quantidade || 0),
      formatBRL(item.item_valor_unitario || 0),
      formatBRL(item.item_valor_total || 0),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 15 },
      2: { cellWidth: 12 },
      3: { cellWidth: 65 },
      4: { cellWidth: 12 },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
    didDrawPage: (data: any) => {
      // Footer for each page
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

    const doc = new jsPDF();
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
        {isBatch ? "XLSX Completo (Lote)" : "Exportar XLSX"}
      </Button>
      <Button onClick={handleGeneratePdf} disabled={loadingXls || loadingPdf || contractIds.length === 0} className={buttonClassName} variant={variant} size={size}>
        {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
        {isBatch ? "PDF Completo (Lote)" : "Exportar PDF"}
      </Button>
    </>
  );
}
