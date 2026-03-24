
import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Asset } from '../types';
import BackButton from './BackButton';
import { Check, Trash2, Download, FileText, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { generateInventoryBook, generateKardexFichas } from '../utils/reportGenerator';
import { Loader2, BookOpen, CreditCard } from 'lucide-react';

interface SignatureProps {
  assets: Asset[];
  onBack: () => void;
  onConfirm: (signature: string) => void;
  unitName: string;
}

const Signature: React.FC<SignatureProps> = ({ assets, onBack, onConfirm, unitName }) => {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const clear = () => {
    sigCanvas.current?.clear();
    setIsSigned(false);
  };

  const save = () => {
    if (sigCanvas.current?.isEmpty()) {
      alert('Por favor, assine antes de confirmar.');
      return;
    }
    const signature = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || '';
    onConfirm(signature);
  };

  const generatePDF = () => {
    if (sigCanvas.current?.isEmpty()) {
      alert('Por favor, assine antes de gerar o PDF.');
      return;
    }

    const doc = new jsPDF();
    const signature = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || '';

    // Header
    doc.setFontSize(18);
    doc.text('Protocolo de Inventário GBR v24', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Empresa: ${unitName}`, 20, 35);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, 42);
    doc.text(`Total de Itens: ${assets.length}`, 20, 49);

    // Table
    const tableData = assets.map(a => [
      a.ETIQUETA || 'S/E',
      a.DESCRICAODOATIVO || 'S/D',
      a.ENDERECO || 'S/L',
      a._conferido ? 'SIM' : 'NÃO',
      a.TAG_INVENTARIO || '---'
    ]);

    // @ts-expect-error - jspdf-autotable adds autoTable to jsPDF instance
    doc.autoTable({
      startY: 60,
      head: [['Etiqueta', 'Descrição', 'Local', 'Conferido', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }
    });

    // Signature
    // @ts-expect-error - jspdf-autotable adds lastAutoTable to jsPDF instance
    const finalY = doc.lastAutoTable.finalY + 20;
    if (finalY + 50 > 280) doc.addPage();
    
    doc.text('Assinatura do Responsável:', 20, finalY);
    doc.addImage(signature, 'PNG', 20, finalY + 5, 60, 30);
    doc.line(20, finalY + 35, 80, finalY + 35);
    doc.text('__________________________', 20, finalY + 40);
    doc.text('Responsável pela Unidade', 20, finalY + 45);

    doc.save(`INVENTARIO_${unitName}_${new Date().getTime()}.pdf`);
  };

  const handleGenerateBook = async () => {
    setIsGenerating(true);
    try {
      await generateInventoryBook(assets, unitName);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateKardex = async () => {
    setIsGenerating(true);
    try {
      await generateKardexFichas(assets, unitName);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn">
      <div className="pt-12 pb-4 px-4 bg-white border-b border-border flex items-center justify-between shadow-sm z-20">
        <BackButton onClick={onBack} label="Assinatura" subLabel="Termo de Responsabilidade" />
        <div className="w-10 h-10 bg-accent-soft border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
          <ShieldCheck size={20} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-24">
        <div className="bg-white border border-border rounded-[2rem] p-6 shadow-sm modern-card">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-[11px] font-black text-ink uppercase tracking-[0.2em]">Termo de Encerramento</h3>
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Confirmação de Auditoria Física</p>
            </div>
          </div>

          <p className="text-xs text-ink-muted leading-relaxed mb-6">
            Eu, responsável pela unidade <strong>{unitName}</strong>, declaro que o inventário físico dos ativos imobilizados foi realizado sob minha supervisão, estando os itens listados em conformidade com a realidade física encontrada.
          </p>

          <div className="bg-bg-main border-2 border-dashed border-border rounded-2xl p-2 relative">
            <SignatureCanvas 
              ref={sigCanvas}
              canvasProps={{
                className: 'w-full h-64 rounded-xl cursor-crosshair',
                style: { backgroundColor: '#f8fafc' }
              }}
              onBegin={() => setIsSigned(true)}
            />
            {!isSigned && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <p className="text-xs font-bold uppercase tracking-widest">Assine aqui</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <button 
              onClick={clear}
              className="flex items-center space-x-2 px-4 py-2 text-red-500 font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all"
            >
              <Trash2 size={14} />
              <span>Limpar</span>
            </button>
            <div className="flex space-x-2">
              <button 
                onClick={handleGenerateBook}
                disabled={isGenerating}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                <span>Gerar Book</span>
              </button>
              <button 
                onClick={handleGenerateKardex}
                disabled={isGenerating}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                <span>Gerar Kardex</span>
              </button>
              <button 
                onClick={generatePDF}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                <Download size={14} />
                <span>Gerar PDF</span>
              </button>
              <button 
                onClick={save}
                className="flex items-center space-x-2 px-6 py-2 bg-accent text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
              >
                <Check size={14} />
                <span>Confirmar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-accent-soft border border-accent/10 rounded-2xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <ShieldCheck size={14} className="text-accent" />
            <span className="text-[9px] font-black text-accent uppercase tracking-widest">Segurança GBR v24</span>
          </div>
          <p className="text-[10px] text-accent/70 leading-tight">
            Esta assinatura será vinculada permanentemente aos registros deste inventário, incluindo timestamp e coordenadas GPS do auditor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signature;
