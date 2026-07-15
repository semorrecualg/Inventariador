
import React from 'react';
import { Asset, InventoryCampaign, CampaignStatus } from '../types';
import { ArrowLeft, Printer, ShieldCheck, AlertCircle } from 'lucide-react';

interface AssetPrintViewProps {
  assets: Asset[];
  unitName: string;
  onBack: () => void;
  campaign?: InventoryCampaign | null;
  mode?: 'PARTIAL' | 'FINAL';
  responsibleName?: string;
}

const AssetPrintView: React.FC<AssetPrintViewProps> = ({ 
    assets, 
    unitName, 
    onBack, 
    campaign, 
    mode = 'PARTIAL',
    responsibleName = 'Auditor de Campo'
}) => {
  const handlePrint = () => {
    window.print();
  };

  const isFinal = mode === 'FINAL' || campaign?.status === CampaignStatus.CLOSED;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Barra de Ações (Oculta na Impressão) */}
      <div className="print:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center justify-between px-6 shadow-sm">
        <button 
          onClick={onBack}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="font-bold uppercase text-[10px] tracking-widest">Voltar</span>
        </button>
        <div className="flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                {isFinal ? 'Laudo Final de Inventário Patrimonial' : 'Relatório Parcial de Conferência'}
            </span>
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                {unitName} {campaign ? `| Campanha: ${campaign.name}` : ''}
            </span>
        </div>
        <button 
          onClick={handlePrint}
          className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-lg active:scale-95 transition-all hover:bg-blue-500"
        >
          <Printer size={18} />
          <span className="font-bold uppercase text-[10px] tracking-widest">Gerar PDF</span>
        </button>
      </div>

      {/* Conteúdo do Laudo */}
      <div className="pt-20 print:pt-0 max-w-[21cm] mx-auto p-12 bg-white relative">
        
        {/* Marca d'água para Parcial */}
        {!isFinal && (
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none overflow-hidden print:opacity-[0.05]">
                <span className="text-[120px] font-black -rotate-45 uppercase whitespace-nowrap">
                    Relatório Parcial
                </span>
            </div>
        )}

        {/* Cabeçalho Normativo */}
        <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8 mb-10 relative z-10">
          <div className="space-y-4 max-w-[60%]">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                    <ShieldCheck size={32} />
                </div>
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight leading-none text-slate-900">
                        {isFinal ? 'Laudo de Inventário Patrimonial' : 'Relatório de Conferência de Campo'}
                    </h1>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                        Conformidade CPC 27 / NBC TG 27 / Auditoria Especializada
                    </p>
                </div>
            </div>
            
            <div className="space-y-1">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Responsável Técnico</p>
                <p className="text-xs font-black text-slate-900 uppercase">{responsibleName}</p>
            </div>
          </div>

          <div className="text-right space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 inline-block text-left min-w-[200px]">
                <div className="mb-2 pb-2 border-b border-slate-200">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Organização / Unidade</p>
                    <p className="text-xs font-black text-slate-900 uppercase truncate">{unitName}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Emissão</p>
                        <p className="text-[10px] font-bold text-slate-900">{new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Itens</p>
                        <p className="text-[10px] font-bold text-slate-900">{assets.length}</p>
                    </div>
                </div>
            </div>
            {campaign && (
                <div className="flex items-center justify-end gap-2 text-blue-600">
                    <AlertCircle size={12} />
                    <span className="text-[9px] font-black uppercase">Ref: {campaign.name}</span>
                </div>
            )}
          </div>
        </div>

        {/* Tabela de Ativos / Consolidação */}
        <div className="w-full relative z-10">
          {assets.map((asset, index) => (
            <div key={asset.id} className="mb-10 pb-10 border-b border-slate-100 last:border-0 break-inside-avoid">
              <div className="grid grid-cols-12 gap-8">
                
                {/* Lado Esquerdo: Dados Mestres e Auditoria */}
                <div className="col-span-8 space-y-6">
                  <div className="flex items-start gap-4">
                    <span className="text-xs font-black text-white bg-slate-900 px-2 py-1 rounded flex-shrink-0 mt-1">
                      {String(index + 1).padStart(3, '0')}
                    </span>
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 leading-tight">
                        {asset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO CADASTRAL'}
                        </h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                            {asset.conta_contabil || 'SEM CONTA'} | {asset.CENTRODECUSTO || 'SEM CC'}
                        </p>
                    </div>
                  </div>

                  {/* Grid de Informações Cruciais */}
                  <div className="grid grid-cols-3 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Tag / Etiqueta</p>
                      <p className="text-sm font-black text-slate-900">{asset.ETIQUETA || 'N/A'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Num. Série</p>
                      <p className="text-sm font-bold text-slate-900">{asset.SERIAL || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Status Auditoria</p>
                      <p className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                          asset._conferido ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                          {asset.TAG_INVENTARIO || 'PENDENTE'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Valor Aquisição</p>
                      <p className="text-[10px] font-bold text-slate-900">
                          {asset.VLRAQUISIC ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(asset.VLRAQUISIC)) : 'R$ 0,00'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Data Aquisição</p>
                      <p className="text-[10px] font-bold text-slate-900">{asset.DATAAQUISIC || 'N/A'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Conservação</p>
                      <p className="text-[10px] font-black text-slate-900 uppercase">{asset.ESTADO_CONSERVACAO || 'NÃO AVALIADO'}</p>
                    </div>
                  </div>

                  {/* Campo de Notas e Evidências Geográficas */}
                  <div className="border-l-4 border-slate-200 pl-4 py-2">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Conformidade e Localização</p>
                    <div className="space-y-1">
                        <p className="text-xs text-slate-700 leading-relaxed italic">
                            &quot;{asset.AUDITOR_STATUS_CONFERENCIA || 'Conferência física realizada sem ressalvas.'}&quot;
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">
                            GeoRef: {asset.latitude ? `${asset.latitude}, ${asset.longitude}` : 'Coordenadas não registradas'} | {asset.ENDERECO || 'Localidade indefinida'}
                        </p>
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Evidência Fotográfica e Assinatura */}
                <div className="col-span-4 flex flex-col items-center justify-start space-y-6">
                  <div className="w-full">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 text-center">Evidência Fotográfica</p>
                    {asset._photoUrl ? (
                        <div className="relative group">
                            <img 
                                src={asset._photoUrl} 
                                alt="Foto do Ativo" 
                                className="w-full h-48 object-cover rounded-2xl border-2 border-slate-100 shadow-sm transition-all grayscale-[0.5] print:grayscale-0"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    ) : (
                        <div className="w-full h-48 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                            <Printer size={24} strokeWidth={1} />
                            <span className="text-[8px] font-black uppercase mt-2 tracking-widest">Sem evidência</span>
                        </div>
                    )}
                  </div>
                  
                  {/* Assinatura Digital do Auditor para este item (se houver snapshot) */}
                  {asset._assinatura && (
                    <div className="w-full pt-4 border-t border-slate-100 text-center">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Assinatura Auditor</p>
                        <img 
                            src={asset._assinatura} 
                            alt="Assinatura" 
                            className="h-10 mx-auto grayscale print:opacity-80" 
                        />
                        <p className="text-[7px] font-bold text-slate-400 uppercase mt-1">Validado Digitalmente</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé e Campo de Firmas (Apenas Final) */}
        <div className="mt-16 pt-12 border-t-4 border-slate-900 relative z-10">
          <div className="grid grid-cols-2 gap-16 mb-12">
            <div className="text-center space-y-2 border-t border-slate-300 pt-4">
                <div className="h-16 flex items-end justify-center pb-2">
                    {/* Placeholder para assinatura manual ou digital */}
                </div>
                <p className="text-xs font-black text-slate-900 uppercase">Auditor / Responsável Técnico</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">{responsibleName}</p>
            </div>
            <div className="text-center space-y-2 border-t border-slate-300 pt-4">
                <div className="h-16 flex items-end justify-center pb-2">
                </div>
                <p className="text-xs font-black text-slate-900 uppercase">Gestor de Patrimônio / Organização</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Representante Legal</p>
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                Relatório Gerado via GBR Auditoria Patrimonial v24.50 Expert
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase max-w-lg mx-auto leading-tight italic">
                &quot;Este laudo reflete a conformidade dos ativos físicos com os registros contábeis, atendendo às diretrizes do CPC 27 e NBC TG 27, validado via auditoria de campo georreferenciada.&quot;
            </p>
            <p className="text-[8px] font-medium text-slate-300 mt-4">
                ID Rastreabilidade: {campaign?.id || 'LOCAL-PRINT'} | Data: {new Date().toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 1.5cm;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
          }
          .min-h-screen {
            min-h: 0 !important;
          }
          .print-hidden {
            display: none !important;
          }
          .break-inside-avoid {
            break-inside: avoid;
          }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-slate-900 { background-color: #0f172a !important; }
        }
      `}} />
    </div>
  );
};

export default AssetPrintView;
