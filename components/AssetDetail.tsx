
import React, { useState, useMemo, useEffect } from 'react';
import { Asset } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Edit2, 
  X, 
  ShieldCheck, 
  Save, 
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
  QrCode,
  Printer,
  Download
} from 'lucide-react';

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
  onBulkUpdate: (ids: string[]) => void;
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
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => { setWorkingAsset({ ...assets[0] }); }, [assets]);

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
      return uniqueEnderecos.filter(e => e.includes(editValue.toUpperCase())).slice(0, 5);
    }
    if (editingField === 'CENTRODECUSTO') {
      return uniqueCentrosDeCusto.filter(e => e.includes(editValue.toUpperCase())).slice(0, 5);
    }
    return [];
  }, [editingField, editValue, uniqueEnderecos, uniqueCentrosDeCusto]);

  const applyFieldEdit = (val?: string) => {
    if (editingField) {
      const updates: Asset = { ...workingAsset };
      const newValue = (val || editValue).toUpperCase().trim();
      if (String(updates[editingField]) !== newValue) {
        const altered = new Set<string>(updates._camposAlterados || []);
        altered.add(editingField);
        updates._camposAlterados = Array.from(altered);
      }
      updates[editingField] = newValue;
      setWorkingAsset(updates);
      setEditingField(null);
    }
  };

  const handleFinalize = () => {
    if (isBatch) {
      onBulkUpdate(assets.map(a => String(a.id)));
    } else {
      onUpdate({ ...workingAsset, _conferido: true });
    }
    onBack();
  };

  const headerBg = isBatch 
    ? 'bg-amber-600' 
    : String(workingAsset.STATUS).includes('BAIXADO') 
      ? 'bg-red-900' 
      : workingAsset._conferido 
        ? 'bg-emerald-900' 
        : 'bg-slate-900';

  const qrValue = useMemo(() => {
    const DB_ORDER = [
      'EMPRESA', 'STATUS', 'ETIQUETA', 'QT', 'DESCRICAODOATIVO', 'SERIAL', 
      'DATAAQUSIC', 'CNPJ', 'NOMEFORNECEDOR', 'NOTAFISCAL', 'ENDERECO', 
      'REGISTRO', 'SUBREG', 'DATABAIXA', 'CONTACONTABIL', 'PRIMARYKEY', 
      'CENTRODECUSTO', 'VLRAQUISIC'
    ];

    if (qrCodeFields.length === 0) return workingAsset.ETIQUETA || 'NO_TAG';
    
    // Ordenar campos conforme a base de dados
    const sortedFields = [...qrCodeFields].sort((a, b) => DB_ORDER.indexOf(a) - DB_ORDER.indexOf(b));

    return sortedFields.map(f => {
      const val = workingAsset[f];
      if (f === 'DATAAQUSIC' || f === 'DATABAIXA') return formatDateBR(val);
      if (f === 'VLRAQUISIC') return formatCurrency(val);
      return String(val || '');
    }).filter(v => v !== '').join(' | ');
  }, [workingAsset, qrCodeFields]);

  return (
    <div className="flex flex-col h-full bg-[#f4f4f5] animate-fadeIn overflow-hidden">
      {/* KARDEX HEADER */}
      <div className={`px-6 pt-10 pb-6 ${headerBg} text-white relative shadow-xl z-20`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="p-2 bg-white/10 rounded-lg active:scale-90 transition-all"><X size={18} /></button>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowQrModal(true)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all flex items-center space-x-2 border border-white/20"
            >
              <QrCode size={16} />
              <span className="text-[9px] font-black uppercase tracking-widest">QR CODE</span>
            </button>
            <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/90">
                {isBatch ? 'LOTE' : 'KARDEK v24.50'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col">
          <h2 className="text-lg font-black uppercase tracking-tight leading-tight mb-4 text-white line-clamp-2">
            {isBatch ? `LOTE PATRIMONIAL: ${workingAsset.ETIQUETA}` : (workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO')}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-sm">
              <p className="text-[7px] font-black text-white/50 uppercase tracking-widest mb-1">PLAQUETA</p>
              <p className="text-xl font-black font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
            </div>
            <div className="bg-black/20 border border-white/10 p-3 rounded-xl backdrop-blur-sm flex flex-col justify-center">
              <p className="text-[7px] font-black text-white/50 uppercase tracking-widest mb-1">STATUS</p>
              <span className="text-[9px] font-black uppercase text-sky-400">{workingAsset.TAG_DUPLICIDADE}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KARDEX BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32 bg-[#f4f4f5]">
          {isBatch && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center">
                  <AlertCircle size={12} className="mr-1 text-amber-500" /> REGISTROS NO LOTE
                </p>
                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{assets.length} ITENS</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar">
                {assets.map((a, idx) => (
                  <div key={a.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-800 truncate uppercase">{a.DESCRICAODOATIVO}</p>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">REG: {a.REGISTRO} | SUB: {a.SUBREG}</p>
                    </div>
                    <span className="text-[8px] font-black text-slate-300 font-mono ml-2">#{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fieldGroups.map((group) => (
            <div key={group.title} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">{group.title}</span>
              </div>
              
              <div className="divide-y divide-slate-100">
                {group.fields.map(({ key, label, icon: Icon }) => {
                  const isDateField = key === 'DATAAQUSIC' || key === 'DATABAIXA';
                  const isCurrency = key === 'VLRAQUISIC';
                  const rawVal = workingAsset[key];
                  let displayVal = rawVal || '---';
                  if (isDateField) displayVal = formatDateBR(rawVal);
                  if (isCurrency) displayVal = formatCurrency(rawVal);

                  const canEdit = editableFields.includes(key);
                  if (!rawVal && key === 'DATABAIXA') return null;

                  return (
                    <div 
                      key={key} 
                      onClick={(e) => { e.stopPropagation(); if (canEdit) { setEditingField(key); setEditValue(String(rawVal || '')); } }} 
                      className={`px-4 py-3 flex flex-col transition-all active:bg-slate-50 ${editingField === key ? 'bg-sky-50 ring-1 ring-inset ring-sky-500' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1.5">
                          {Icon && <Icon size={10} className="text-slate-400" />}
                          <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                        </div>
                        {canEdit && <Edit2 size={10} className="text-sky-500" />}
                      </div>
                      
                      {editingField === key ? (
                        <div className="mt-2 flex items-center space-x-2">
                          <input 
                            autoFocus 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} 
                            className="flex-1 bg-white p-2 border border-sky-300 rounded-lg text-[11px] font-bold uppercase text-slate-900 outline-none shadow-inner" 
                          />
                          <button onClick={() => applyFieldEdit()} className="w-10 h-10 bg-sky-600 text-white rounded-lg flex items-center justify-center shadow-md active:scale-95"><Check size={18}/></button>
                        </div>
                      ) : (
                        <p className={`text-[12px] font-bold uppercase leading-tight font-mono ${rawVal ? 'text-slate-900' : 'text-slate-300'}`}>
                          {displayVal}
                        </p>
                      )}
                      
                      {editingField === key && suggestions.length > 0 && (
                        <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1">SUGESTÕES</p>
                          <div className="flex flex-wrap gap-1">
                            {suggestions.map(s => (
                              <button key={s} onClick={(e) => { e.stopPropagation(); applyFieldEdit(s); }} className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[8px] font-bold text-sky-600 uppercase active:bg-sky-600 active:text-white">
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
           <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em]">AUDIT AUTHORITY</span>
           <span className="text-[8px] font-black text-slate-900 uppercase tracking-widest">v24.50 KARDEK</span>
         </div>
         <button onClick={handleFinalize} className={`${isBatch ? 'bg-amber-600 shadow-amber-900/20' : 'bg-sky-600 shadow-sky-900/20'} text-white px-8 py-3.5 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 flex items-center space-x-2 transition-all`}>
            <Save size={16} />
            <span>{isBatch ? 'EFETIVAR LOTE' : 'EFETIVAR AUDITORIA'}</span>
         </button>
      </div>

      {/* QR CODE MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fadeIn">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowQrModal(false)} />
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 animate-scaleUp">
            <div className="bg-slate-900 p-6 text-center">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[8px] font-black text-sky-400 uppercase tracking-[0.3em]">GERADOR DE ETIQUETA</span>
                <button onClick={() => setShowQrModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
              </div>
              <h3 className="text-white font-black uppercase tracking-tight text-lg leading-tight mb-1">
                {workingAsset.ETIQUETA || 'S/ ETQ'}
              </h3>
              <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest truncate">
                {workingAsset.DESCRICAODOATIVO}
              </p>
            </div>
            
            <div className="p-8 flex flex-col items-center justify-center bg-white">
              <div className="p-5 bg-white border-4 border-slate-100 rounded-[2.5rem] shadow-inner mb-6 flex flex-col items-center w-full">
                {/* TOPO: EMPRESA */}
                <div className="mb-3 w-full text-center border-b border-slate-50 pb-2">
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight truncate px-2">
                    {workingAsset.EMPRESA || 'GBR SYSTEMS'}
                  </p>
                </div>

                <div className="p-2 bg-white rounded-xl">
                  <QRCodeSVG 
                    value={qrValue} 
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                {/* BASE: ATIVO + ETIQUETA COM DESTAQUE NUMÉRICO */}
                <div className="mt-4 w-full text-center border-t border-slate-50 pt-3">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">ATIVO PATRIMONIAL</p>
                  <div className="bg-slate-950 text-white py-2 px-4 rounded-xl shadow-lg">
                    <p className="text-2xl font-black font-mono tracking-tighter leading-none">
                      {workingAsset.ETIQUETA || '000000'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mb-4 text-center">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Conteúdo Codificado:</p>
                <p className="text-[10px] font-black text-slate-900 uppercase break-all max-w-[200px]">{qrValue}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 w-full">
                <button className="flex items-center justify-center space-x-2 py-3 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase active:scale-95 transition-all">
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
                <button className="flex items-center justify-center space-x-2 py-3 bg-sky-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-sky-900/20 active:scale-95 transition-all">
                  <Download size={14} />
                  <span>Salvar</span>
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 border-t border-slate-100 text-center">
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                PADRÃO GBR AUDIT v24.50
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDetail;
