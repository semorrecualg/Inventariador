import * as XLSX from 'xlsx';
import { Asset } from '../types';
import { logger } from '../utils/logger';

export class ReportService {
  /**
   * Gera relatório de auditoria industrial completo
   */
  async generateAuditReport(assets: Asset[]) {
    try {
      logger.info(`[GBR-Report] Gerando relatório para ${assets.length} ativos...`);
      
      const worksheet = XLSX.utils.json_to_sheet(assets.map(a => ({
        'ESTADO': a.C_STATUS_AUDIT === 'pending' ? 'PENDENTE' : 'CONFERIDO',
        'PATRIMONIO': a.etiqueta || a.registro,
        'DESCRICAO': a.descricaodoativo,
        'CENTRO_CUSTO': a.centrodecusto,
        'CONTA': a.conta_contabil,
        'UNIDADE': a.filial || a._unitid,
        'ENDERECO': a.endereco,
        'DATA_AUDITORIA': new Date().toLocaleDateString('pt-BR')
      })));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria_Kardek");
      
      XLSX.writeFile(workbook, `GBR_AUDITORIA_MASTER_${new Date().getTime()}.xlsx`);
      return true;
    } catch (err) {
      logger.error("[GBR-Report] Erro ao gerar Excel:", err);
      return false;
    }
  }

  /**
   * Exportação CSV Simples para sistemas legados
   */
  exportToCSV(assets: Asset[]) {
    const headers = ["ETIQUETA", "DESCRICAO", "STATUS"];
    const rows = assets.map(a => `${a.etiqueta},"${a.descricaodoativo}",${a.C_STATUS_AUDIT}`);
    const csvContent = [headers.join(","), ...rows].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `gbr_legacy_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const reportService = new ReportService();
