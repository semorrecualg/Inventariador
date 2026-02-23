
import React, { useState, useMemo, useEffect } from 'react';
import { Asset } from '../types';
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
  CheckCircle
} from 'lucide-react';

const formatDateBR = (val: any): string => {
  if (!val) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return "";
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  return s.toUpperCase();
};

const formatCurrency = (val: any): string => {
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
  uniqueEnderecos: string[];
  uniqueCentrosDeCusto: string[];
}

const AssetDetail: React.FC<AssetDetailProps> = ({ assets, onBack, onUpdate, onBulkUpdate, editableFields, uniqueEnderecos, uniqueCentrosDeCusto }) => {
  const isBatch = assets.length > 1;
  const [workingAsset, setWorkingAsset] = useState<Asset>({ ...assets[0] });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeHint, setActiveHint] = useState<string | null>(null);

  useEffect(() => { setWorkingAsset({ ...assets[0] }); }, [assets]);

  const displayFields = [
    { key: 'EMPRESA', label: 'Empresa', icon: Building2 },
    { key: 'STATUS', label: 'Status Vital', icon: ShieldCheck },
    { key: 'ETIQUETA', label: 'Etiqueta de Patrimônio', icon: FileText },
    { key: 'CENTRODECUSTO', label: 'Centro de Custo', icon: Briefcase },
    { key: 'VLRAQUISIC', label: 'Valor de Aquisição', icon: Wallet },
    { key: 'DESCRICAODOATIVO', label: 'Descrição do Ativo', icon: null },
    { key: 'SERIAL', label: 'Número de Série', icon: null },
    { key: 'DATAAQUSIC', label: 'Data de Aquisição', icon: Calendar },
    { key: 'DATABAIXA', label: 'Data de Baixa', icon: Calendar },
    { key: 'ENDERECO', label: 'Localização Física', icon: MapPin },
    { key: 'CONTACONTABIL', label: 'Conta Contábil', icon: null },
    { key: 'PRIMARYKEY', label: 'Chave Primária', icon: null }
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
      const updates: any = { ...workingAsset };
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
      : !!workingAsset._conferido 
        ? 'bg-emerald-900' 
        : 'bg-slate-900';

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden" onClick={() => setActiveHint(null)}>
      <div className={`px-6 pt-12 pb-8 ${headerBg} text-white relative shadow-2xl z-20 transition-colors duration-500`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-3 bg-white/10 rounded-2xl active:scale-90 transition-all"><X size={20} /></button>
          <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-full border border-white/10">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/90">
              {isBatch ? 'MODO INVENTÁRIO EM LOTE' : 'Protocolo v24.40'}
            </span>
          </div>
        </div>
        
        {isBatch && (
          <div className="mb-4 flex items-center space-x-2 bg-black/30 px-4 py-2 rounded-xl border border-white/20 self-start animate-pulse">
            <AlertCircle size={14} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Atenção: {assets.length} Itens Detectados</span>
          </div>
        )}

        <h2 className="text-2xl font-black uppercase tracking-tight leading-tight mb-6 text-white italic">
          {isBatch ? `LOTE: ${workingAsset.ETIQUETA}` : (workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO')}
        </h2>

        <div className="bg-black/20 border border-white/10 p-5 rounded-[2rem] backdrop-blur-md flex items-center justify-between">
           <div>
              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Identificador Principal</p>
              <div className="flex items-center space-x-2">
                <Hash size={20} className="text-white/60" />
                <p className="text-2xl font-black font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
              </div>
           </div>
           <div className="flex flex-col items-end space-y-2">
              <span className="bg-sky-600/30 text-sky-400 px-3 py-1 rounded-lg text-[8px] font-black uppercase border border-sky-500/30">{workingAsset.TAG_DUPLICIDADE}</span>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar pb-44 relative z-10">
          {isBatch && (
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registros Vinculados ao Lote</p>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">{assets.length} ITENS</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
                {assets.map((a, idx) => (
                  <div key={a.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group active:bg-slate-800 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-white truncate uppercase leading-tight">{a.DESCRICAODOATIVO}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">REG: {a.REGISTRO}</span>
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SUB: {a.SUBREG}</span>
                        {a._conferido && <Check size={8} className="text-emerald-500" />}
                      </div>
                    </div>
                    <div className="ml-4 px-3 py-1 bg-slate-800 rounded-lg border border-white/5">
                      <span className="text-[9px] font-black text-amber-500 font-mono">#{idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-px bg-slate-800 my-4 mx-2" />
            </div>
          )}

          {displayFields.map(({ key, label, icon: Icon }) => {
            const isDateField = key === 'DATAAQUSIC' || key === 'DATABAIXA';
            const isCurrency = key === 'VLRAQUISIC';
            const rawVal = workingAsset[key];
            let displayVal = rawVal || '---';
            if (isDateField) displayVal = formatDateBR(rawVal);
            if (isCurrency) displayVal = formatCurrency(rawVal);

            const canEdit = editableFields.includes(key);
            if (!rawVal && key === 'DATABAIXA') return null;

            return (
              <div key={key} onClick={(e) => { e.stopPropagation(); if (canEdit) { setEditingField(key); setEditValue(String(rawVal || '')); } }} className={`p-4 border rounded-[1.8rem] transition-all ${editingField === key ? 'bg-slate-800 border-sky-500 scale-[1.02]' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      {Icon && <Icon size={12} className="text-sky-400" />}
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-sky-400">{label}</label>
                    </div>
                    {canEdit ? <Edit2 size={10} className="text-sky-500" /> : <Lock size={10} className="text-slate-700" />}
                </div>
                {editingField === key ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} className="flex-1 bg-slate-950 p-4 border border-sky-600 rounded-2xl text-[12px] font-black uppercase text-white outline-none" />
                      <button onClick={() => applyFieldEdit()} className="w-12 h-12 bg-sky-600 text-white rounded-xl flex items-center justify-center"><Check size={20}/></button>
                    </div>
                    
                    {suggestions.length > 0 && (
                      <div className="p-2 bg-slate-950/50 border border-slate-700 rounded-2xl animate-fadeIn">
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest px-3 mb-2">Sugestões da Base</p>
                        <div className="space-y-1">
                          {suggestions.map(s => (
                            <button key={s} onClick={(e) => { e.stopPropagation(); applyFieldEdit(s); }} className="w-full text-left p-3 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-bold text-sky-400 uppercase active:bg-sky-600 active:text-white flex items-center justify-between group">
                              <span className="truncate">{s}</span>
                              <CheckCircle size={10} className="opacity-0 group-active:opacity-100" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : <p className="text-[13px] font-bold uppercase text-white leading-tight">{displayVal}</p>}
              </div>
            );
          })}
      </div>
      
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/95 backdrop-blur-md border-t border-slate-900 flex items-center justify-between z-30">
         <div className="text-[8px] font-black text-slate-700 uppercase tracking-[0.4em]">Audit Authority v24.40</div>
         <button onClick={handleFinalize} className={`${isBatch ? 'bg-amber-600' : 'bg-sky-600'} text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-2 transition-all`}>
            <Save size={18} />
            <span>{isBatch ? 'Efetivar Lote' : 'Efetivar Auditoria'}</span>
         </button>
      </div>
    </div>
  );
};

export default AssetDetail;
