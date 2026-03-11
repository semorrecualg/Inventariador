
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, TagInventario } from '../types';

import { 
  Edit2, 
  X, 
  ShieldCheck, 
  Check, 
  MapPin, 
  Building2, 
  FileText, 
  User, 
  Hash, 
  Calendar, 
  AlertCircle, 
  Lock,
  Info,
  Briefcase,
  Wallet,
  QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const formatDateBR = (val: string | number | null | undefined): string => {
  if (!val) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return "";
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  return s.toUpperCase();
};

const formatCurrency = (val: string | number | null | undefined): string => {
  if (!val) return "R$ 0,00";
  const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  if (isNaN(num)) return String(val).toUpperCase();
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

interface AssetDetailProps {
  assets: Asset[];
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  onBulkUpdate: (ids: string[], updates?: Partial<Asset>) => void;
  editableFields: string[];
  qrCodeFields: string[];
  uniqueEnderecos: string[];
  uniqueCentrosDeCusto: string[];
}

const AssetDetail: React.FC<AssetDetailProps> = ({ assets, onBack, onUpdate, onBulkUpdate, editableFields, qrCodeFields, uniqueEnderecos, uniqueCentrosDeCusto }) => {
  const isBatch = assets.length > 1;
  const [workingAsset, setWorkingAsset] = useState<Asset>({ ...assets[0] });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);


  useEffect(() => { setWorkingAsset({ ...assets[0] }); }, [assets]);

  const qrCodeData = useMemo(() => {
    return qrCodeFields.map(field => workingAsset[field] || '').join('|');
  }, [qrCodeFields, workingAsset]);

  const fieldGroups = [
    {
      title: 'IDENTIFICAÇÃO TÉCNICA',
      fields: [
        { key: 'ETIQUETA', label: 'PLAQUETA PATRIMONIAL', icon: FileText },
        { key: 'DESCRICAODOATIVO', label: 'DESCRIÇÃO DO BEM', icon: Info },
        { key: 'QT', label: 'QUANTIDADE', icon: Hash },
        { key: 'SERIAL', label: 'NÚMERO DE SÉRIE', icon: Hash },
        { key: 'REGISTRO', label: 'REGISTRO MESTRE', icon: Hash },
        { key: 'SUBREG', label: 'SUB-REGISTRO', icon: Hash },
        { key: 'PRIMARYKEY', label: 'CHAVE PRIMÁRIA (PK)', icon: Lock }
      ]
    },
    {
      title: 'LOCALIZAÇÃO E CUSTO',
      fields: [
        { key: 'EMPRESA', label: 'UNIDADE OPERACIONAL', icon: Building2 },
        { key: 'ENDERECO', label: 'ENDEREÇO FÍSICO', icon: MapPin },
        { key: 'CENTRODECUSTO', label: 'CENTRO DE CUSTO', icon: Briefcase }
      ]
    },
    {
      title: 'DADOS DE AQUISIÇÃO',
      fields: [
        { key: 'VLRAQUISIC', label: 'VALOR DE AQUISIÇÃO', icon: Wallet },
        { key: 'DATAAQUSIC', label: 'DATA DE AQUISIÇÃO', icon: Calendar },
        { key: 'NOTAFISCAL', label: 'NOTA FISCAL (NF)', icon: FileText },
        { key: 'NOMEFORNECEDOR', label: 'FORNECEDOR', icon: User },
        { key: 'CNPJ', label: 'CNPJ FORNECEDOR', icon: Building2 }
      ]
    },
    {
      title: 'CONTROLE CONTÁBIL',
      fields: [
        { key: 'STATUS', label: 'STATUS OPERACIONAL', icon: ShieldCheck },
        { key: 'CONTACONTABIL', label: 'CONTA CONTÁBIL', icon: Briefcase },
        { key: 'DATABAIXA', label: 'DATA DE BAIXA', icon: Calendar }
      ]
    }
  ];

  const suggestions = useMemo(() => {
    if (editingField === 'ENDERECO') {
      return uniqueEnderecos.filter(e => e.includes(editValue.toUpperCase())).slice(0, 15);
    }
    if (editingField === 'CENTRODECUSTO') {
      return uniqueCentrosDeCusto.filter(e => e.includes(editValue.toUpperCase())).slice(0, 15);
    }
    return [];
  }, [editingField, editValue, uniqueEnderecos, uniqueCentrosDeCusto]);

  const applyFieldEdit = (val?: string) => {
    if (editingField) {
      const updates: Asset = { ...workingAsset };
      const newValue = (val || editValue).toUpperCase().trim();
      updates[editingField] = newValue;
      setWorkingAsset(updates);
      setEditingField(null);
    }
  };

  const handleFinalize = () => {
    const finalAsset = { ...workingAsset };
    
    // Se o usuário está editando um campo e clicou direto em SALVAR, aplicamos o valor atual
    if (editingField) {
      const newValue = editValue.toUpperCase().trim();
      finalAsset[editingField] = newValue;
    }

    if (isBatch) {
      // Para lote, se houve alteração em algum campo no finalAsset, aplicamos a todos os itens do lote.
      const manualUpdates: Partial<Asset> = {};
      const original = assets[0];
      
      Object.keys(finalAsset).forEach(key => {
        if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
        if (String(finalAsset[key]) !== String(original[key])) {
          (manualUpdates as Record<string, unknown>)[key] = finalAsset[key];
        }
      });

      onBulkUpdate(assets.map(a => String(a.id)), manualUpdates);
    } else {
      onUpdate({ ...finalAsset, _conferido: true });
    }
    onBack();
  };

  const getTagColors = (tag: TagInventario | string) => {
    switch (tag) {
      case TagInventario.BAIXADO: return { bg: 'bg-red-600', hex: '#dc2626' };
      case TagInventario.ADOTADO_EXTERNO: return { bg: 'bg-sky-600', hex: '#0284c7' };
      case TagInventario.ADOTADO: return { bg: 'bg-indigo-600', hex: '#4f46e5' };
      case TagInventario.RE_ADOTADO: return { bg: 'bg-fuchsia-600', hex: '#c026d3' };
      case TagInventario.CONFERIDO: return { bg: 'bg-emerald-600', hex: '#059669' };
      case TagInventario.FALTA_ETIQUETAR: return { bg: 'bg-amber-600', hex: '#d97706' };
      case TagInventario.ETIQUETADO: return { bg: 'bg-violet-600', hex: '#7c3aed' };
      case TagInventario.NOVO_ITEM: return { bg: 'bg-orange-600', hex: '#ea580c' };
      case TagInventario.DIVERGENCIA: return { bg: 'bg-rose-600', hex: '#e11d48' };
      default: return { bg: 'bg-slate-900', hex: '#0f172a' };
    }
  };

  const isBaixado = useMemo(() => {
    const statusUpper = String(workingAsset.STATUS || '').toUpperCase();
    return statusUpper.includes('BAIXA') || !!workingAsset.DATABAIXA;
  }, [workingAsset.STATUS, workingAsset.DATABAIXA]);

  const tagColors = useMemo(() => {
    if (isBatch) return { bg: 'bg-amber-600', hex: '#d97706' };
    const tag = workingAsset.TAG_INVENTARIO || (workingAsset._conferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE);
    const base = getTagColors(tag);
    // Se for baixado, vamos manter o cabeçalho vermelho ou com tom de alerta
    if (isBaixado) {
      return { bg: 'bg-red-600', hex: '#dc2626' };
    }
    return base;
  }, [isBatch, workingAsset, isBaixado]);

  const headerBg = tagColors.bg;



  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      {/* KARDEX HEADER */}
      <div className={`px-5 pt-8 pb-6 ${headerBg} text-white relative shadow-md z-20`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-3.5 bg-white/10 border border-white/20 rounded-xl active:scale-90 transition-all backdrop-blur-md hover:bg-white/20">
            <X size={22} />
          </button>
          <div className="flex items-center space-x-3">
            <button onClick={() => setIsQrModalOpen(true)} className="p-3.5 bg-white/10 border border-white/20 rounded-xl active:scale-90 transition-all backdrop-blur-md hover:bg-white/20">
              <QrCode size={22} />
            </button>
            <div className="bg-white/10 px-5 py-2.5 rounded-xl border border-white/20 backdrop-blur-md">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
                {isBatch ? 'LOTE' : 'KARDEK v24.50'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col">
          <h2 className="text-xl font-bold uppercase tracking-tight leading-tight mb-6 text-white line-clamp-2">
            {isBatch ? `LOTE PATRIMONIAL: ${workingAsset.ETIQUETA}` : (workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO')}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">PLAQUETA</p>
              <p className="text-2xl font-bold font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
            </div>
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-inner flex flex-col justify-center">
              <p className="text-[8px] font-bold text-white/50 uppercase tracking-[0.2em] mb-2">AUDITORIA</p>
              <div className="flex items-center space-x-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isBaixado ? 'bg-red-400 shadow-red-400/50' : 'bg-sky-400 shadow-sky-400/50'} shadow-sm`} />
                <span className={`text-[10px] font-bold uppercase ${isBaixado ? 'text-red-100' : 'text-sky-300'} tracking-widest`}>
                  {isBaixado ? 'BAIXADO | ' : ''}
                  {workingAsset.TAG_INVENTARIO || (workingAsset._conferido ? TagInventario.CONFERIDO : TagInventario.PENDENTE)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KARDEX BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28 bg-bg-main">
          {isBatch && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm modern-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] flex items-center">
                  <AlertCircle size={12} className="mr-1.5 text-amber-500" /> REGISTROS NO LOTE
                </p>
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">{assets.length} ITENS</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar pr-1">
                {assets.map((a, idx) => (
                  <div key={a.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex items-center justify-between shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-800 truncate uppercase tracking-tight">{a.DESCRICAODOATIVO}</p>
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-0.5">REG: {a.REGISTRO} | SUB: {a.SUBREG}</p>
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 font-mono ml-2">#{String(idx + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fieldGroups.map((group) => (
            <div key={group.title} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm modern-card">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">{group.title}</span>
              </div>
              
              <div className="divide-y divide-slate-100">
                {group.fields.map(({ key, label, icon: Icon }) => {
                  const isDateField = key === 'DATAAQUSIC' || key === 'DATABAIXA';
                  const isCurrency = key === 'VLRAQUISIC';
                  const rawVal = workingAsset[key];
                  let displayVal = String(rawVal || '---');
                  if (isDateField) displayVal = formatDateBR(rawVal as string | number | undefined);
                  if (isCurrency) displayVal = formatCurrency(rawVal as string | number | undefined);

                  const canEdit = editableFields.includes(key);
                  if (!rawVal && key === 'DATABAIXA') return null;

                  return (
                    <div 
                      key={key} 
                      onClick={(e) => { e.stopPropagation(); if (canEdit) { setEditingField(key); setEditValue(String(rawVal || '')); } }} 
                      className={`px-4 py-3 flex flex-col transition-all active:bg-slate-50 ${editingField === key ? 'bg-blue-50 ring-1 ring-inset ring-blue-500' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1.5">
                          {Icon && <Icon size={10} className="text-slate-400" />}
                          <label className="text-[7px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</label>
                        </div>
                        {canEdit && <Edit2 size={10} className="text-blue-500" />}
                      </div>
                      
                      {editingField === key ? (
                        <div className="mt-2 flex items-center space-x-2">
                          <input 
                            autoFocus 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} 
                            className="flex-1 bg-white px-3 py-2 border border-blue-300 rounded-lg text-xs font-bold uppercase text-slate-900 outline-none shadow-sm focus:ring-2 focus:ring-blue-500/20" 
                          />
                          <button onClick={() => applyFieldEdit()} className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md active:scale-95 transition-all">
                            <Check size={20}/>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <p className={`text-xs font-bold uppercase leading-tight font-mono tracking-tight ${rawVal ? 'text-slate-900' : 'text-slate-300'}`}>
                            {workingAsset._valoresOriginais?.[key] !== undefined ? `PARA: ${displayVal}` : displayVal}
                          </p>
                          {workingAsset._valoresOriginais?.[key] !== undefined && (
                            <p className="text-[8px] text-red-500 font-bold uppercase mt-1 tracking-wider">
                              DE: {isDateField ? formatDateBR(workingAsset._valoresOriginais[key] as string) : isCurrency ? formatCurrency(workingAsset._valoresOriginais[key] as string) : String(workingAsset._valoresOriginais[key] || '---')}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {editingField === key && suggestions.length > 0 && (
                        <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner">
                          <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em]">Sugestões Disponíveis</p>
                            <span className="text-[7px] font-bold text-blue-500 uppercase">{suggestions.length} encontrados</span>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar py-1">
                            {suggestions.map(s => (
                              <button 
                                key={s} 
                                onClick={(e) => { e.stopPropagation(); applyFieldEdit(s); }} 
                                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-bold text-slate-700 uppercase active:bg-blue-600 active:text-white active:border-blue-600 transition-all shadow-sm hover:border-blue-300"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
      
      {/* KARDEX FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 flex items-center justify-between z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
         <div className="flex flex-col">
           <span className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.3em]">AUDIT AUTHORITY</span>
           <span className="text-[9px] font-bold text-slate-900 uppercase tracking-[0.1em] mt-0.5">v24.50 KARDEK</span>
         </div>
         <button 
           onClick={handleFinalize} 
           className={`text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-3 transition-all tracking-[0.2em] border-b-4 border-black/20 ${tagColors.bg}`}
         >
            <Check size={20} strokeWidth={3} />
            <span>{isBatch ? 'EFETIVAR LOTE' : 'SALVAR E CONFERIR'}</span>
         </button>
      </div>

      {isQrModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn" onClick={() => setIsQrModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] border border-slate-200 shadow-2xl p-10 flex flex-col items-center text-center modern-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-slate-900 uppercase tracking-tight font-mono mb-6">{workingAsset.EMPRESA}</p>
            <div className="bg-white p-6 border-2 border-slate-900 rounded-3xl shadow-inner mb-8">
              <QRCodeSVG value={qrCodeData} size={240} />
            </div>
            <div className="text-center w-full">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-3">NÚMERO DO ATIVO</p>
              <p className="bg-slate-900 text-white w-full py-5 rounded-2xl text-3xl font-bold uppercase tracking-tighter font-mono shadow-xl">{workingAsset.ETIQUETA}</p>
            </div>
            <button onClick={() => setIsQrModalOpen(false)} className="mt-10 w-full py-5 bg-slate-100 text-slate-900 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all">Fechar</button>
          </div>
        </div>
      )}


    </div>
  );
};

export default AssetDetail;
