import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Asset } from '../types';
import { getLocalPhoto } from '../services/photoService';

/**
 * Converte um Blob em uma string DataURL (Base64)
 */
const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Gera o BOOK de Inventário (Relatório Completo)
 */
export const generateInventoryBook = async (assets: Asset[], unitName: string): Promise<void> => {
  const doc = new jsPDF();
  const timestamp = new Date().toLocaleString('pt-BR');

  // Capa
  doc.setFontSize(24);
  doc.setTextColor(79, 70, 229); // Accent color
  doc.text('BOOK DE INVENTÁRIO FÍSICO', 105, 60, { align: 'center' });
  
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(`Unidade: ${unitName}`, 105, 80, { align: 'center' });
  doc.text(`Data de Emissão: ${timestamp}`, 105, 90, { align: 'center' });
  doc.text(`Total de Ativos: ${assets.length}`, 105, 100, { align: 'center' });

  doc.setFontSize(12);
  doc.text('Relatório Gerado via GBR v25.00 Expert', 105, 280, { align: 'center' });

  // Página de Tabela
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Resumo dos Ativos', 20, 20);

  const tableData = assets.map(a => [
    a.etiqueta || 'S/E',
    a.descricaodoativo || 'S/D',
    a.endereco || 'S/L',
    a._conferido ? 'CONFERIDO' : 'PENDENTE',
    a.TAG_INVENTARIO || '---'
  ]);

  // @ts-expect-error - jspdf-autotable
  doc.autoTable({
    startY: 30,
    head: [['Etiqueta', 'Descrição', 'Localização', 'Status', 'Tag']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] },
    styles: { fontSize: 8 }
  });

  doc.save(`BOOK_INVENTARIO_${unitName.replace(/\s+/g, '_')}.pdf`);
};

/**
 * Gera as FICHAS KARDEX (Uma por página com foto)
 */
export const generateKardexFichas = async (assets: Asset[], unitName: string): Promise<void> => {
  const doc = new jsPDF();
  
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (i > 0) doc.addPage();

    // Cabeçalho da Ficha
    doc.setFillColor(248, 250, 252);
    doc.rect(10, 10, 190, 20, 'F');
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text('FICHA KARDEX DE ATIVO', 105, 23, { align: 'center' });

    // Informações Principais
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('DADOS DO ATIVO', 15, 45);
    doc.line(15, 47, 195, 47);

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    doc.text(`ETIQUETA: ${asset.etiqueta || 'NÃO INFORMADA'}`, 15, 55);
    doc.text(`DESCRIÇÃO: ${asset.descricaodoativo || 'SEM DESCRIÇÃO'}`, 15, 65);
    doc.text(`LOCAL: ${asset.endereco || 'NÃO LOCALIZADO'}`, 15, 75);
    doc.text(`ESTADO: ${asset.ESTADO_CONSERVACAO || 'NÃO INFORMADO'}`, 15, 85);

    // Foto do Ativo
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('EVIDÊNCIA FOTOGRÁFICA', 15, 105);
    doc.line(15, 107, 195, 107);

    let photoDataUrl = '';
    
    // Tenta pegar foto local primeiro
    const localBlob = await getLocalPhoto(String(asset.id));
    if (localBlob) {
      photoDataUrl = await blobToDataURL(localBlob);
    } else if (asset._photoUrl && !asset._photoUrl.startsWith('blob:')) {
      // Se tiver URL remota, poderíamos tentar baixar, mas jsPDF addImage com URL externa pode falhar por CORS
      // Por enquanto, focamos na evidência local do inventário INTERNO
    }

    if (photoDataUrl) {
      try {
        doc.addImage(photoDataUrl, 'JPEG', 15, 115, 80, 60);
      } catch {
        doc.text('[Erro ao carregar imagem]', 15, 125);
      }
    } else {
      doc.setFillColor(240, 240, 240);
      doc.rect(15, 115, 80, 60, 'F');
      doc.text('SEM FOTO REGISTRADA', 55, 145, { align: 'center' });
    }

    // Anotações e Auditoria
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('HISTÓRICO DE AUDITORIA', 15, 190);
    doc.line(15, 192, 195, 192);

    doc.setTextColor(20, 20, 20);
    doc.text(`CONFERIDO: ${asset._conferido ? 'SIM' : 'NÃO'}`, 15, 200);
    doc.text(`DATA AUDITORIA: ${asset._conferidoEm ? new Date(asset._conferidoEm).toLocaleString('pt-BR') : 'PENDENTE'}`, 15, 210);
    doc.text(`AUDITOR: ${asset._conferidoPor || 'NÃO IDENTIFICADO'}`, 15, 220);
    
    doc.setFontSize(9);
    doc.text('OBSERVAÇÕES:', 15, 235);
    const obs = asset.OBSERVACOES || 'Nenhuma observação registrada pós-inventário.';
    const splitObs = doc.splitTextToSize(obs, 180);
    doc.text(splitObs, 15, 242);

    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i + 1} de ${assets.length} | Gerado por GBR v25.00 Expert`, 105, 285, { align: 'center' });
  }

  doc.save(`FICHAS_KARDEX_${unitName.replace(/\s+/g, '_')}.pdf`);
};
