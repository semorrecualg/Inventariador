
import React, { useState, useMemo, useEffect } from 'react';
import { Asset } from '../types';
import { 
  ChevronLeft, 
  Edit2, 
  X, 
  CheckCircle, 
  ShieldCheck, 
  Calendar, 
  AlertTriangle, 
  PlusCircle, 
  Save,
  Check
} from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  databaseHeaders?: string[];
}

const PLAQUETA_KEYS = ['PLAQUETA', 'ETIQUETA', 'PATRIMONIO', 'TAG', 'BEM', 'COD_BEM'];

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate, databaseHeaders = [] }) => {
  const [workingAsset, setWorkingAsset] = useState<Asset>({ ...asset });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    setWorkingAsset({ ...asset });
  }, [asset]);

  const checkIsBaixado = (item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA', 'MOTIVO_BAIXA', 'STATUS_BAIXA'];
    for (const term of terms) {
      const val = String(item[term] || '').trim().toUpperCase();
      if (val !== "" && val !== "---" && val !== "0" && val !== "NULL" && val !== "ATIVO") return true;
    }
    return false;
  };

  const isBaixado = checkIsBaixado(workingAsset);
  const tagInv = workingAsset.TAG_INVENTARIO;
  const isConferido = !!workingAsset._conferido;
  const isNewItem = tagInv === 'NOVO ITEM INCLUÍDO';

  const formatValue = (key: string, val: any): string => {
    if (val === undefined || val === null || val === '---' || val === '0' || val === 'NULL' || val === '') return '---';
    const strVal = String(val).trim();
    const isDateField = key.toUpperCase().includes('DATA') || key.toUpperCase().includes('DT_');
    if (isDateField) {
      if (!isNaN(Number(strVal)) && Number(strVal) > 30000 && Number(strVal) < 60000) {
        const date = new Date((Number(strVal) - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
      }
      const d = new Date(strVal);
      if (!isNaN(d.getTime()) && (strVal.includes('-') || strVal.includes('/'))) return d.toLocaleDateString('pt-BR');
    }
    return strVal;
  };

  const originalPlaqueta = useMemo(() => {
    for (const key of PLAQUETA_KEYS) if (workingAsset[key]) return String(workingAsset[key]);
    return '---';
  }, [workingAsset]);

  const displayFields = useMemo(() => {
    const keysToShow = new Set<string>();
    databaseHeaders.forEach(h => keysToShow.add(h));
    Object.keys(workingAsset).forEach(k => { if (!k.startsWith('_') && k !== 'id' && k !== 'PLAQUETA_INVENTARIO' && k !== 'TAG_INVENTARIO') keysToShow.add(k); });
    return Array.from(keysToShow).map(key => [key, workingAsset[key] || ""]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [workingAsset, databaseHeaders]);

  let headerBg = "bg-slate-900";
  if (isBaixado) headerBg = "bg-red-900";
  else if (tagInv === 'ADOTADO') headerBg = "bg-blue-900";
  else if (isNewItem) headerBg = "bg-purple-900";
  else if (isConferido) headerBg = "bg-emerald-900";

  const applyFieldEdit = () => {
    if (editingField) {
      const updates: any = { ...workingAsset };
      const cleanVal = editValue.toUpperCase().trim();
      if (PLAQUETA_KEYS.includes(editingField.toUpperCase())) {
        updates.PLAQUETA_INVENTARIO = cleanVal;
        if (isNewItem) updates[editingField] = cleanVal;
      } else updates[editingField] = cleanVal;
      setWorkingAsset(updates);
      setEditingField(null);
    }
  };

  const handleFinalize = () => {
    const finalAsset: Asset = { ...workingAsset, _conferido: true };
    if (!finalAsset.PLAQUETA_INVENTARIO && !isNewItem) finalAsset.PLAQUETA_INVENTARIO = originalPlaqueta;
    onUpdate(finalAsset);
    onBack();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className={`px-6 pt-12 pb-8 transition-colors duration-500 ${headerBg} text-white relative shadow-2xl z-20`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-3 bg-white/10 rounded-2xl active:scale-90"><X size={20} /></button>
          {isNewItem && <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-full border border-white/10"><PlusCircle size={14} /><span className="text-[9px] font-black uppercase tracking-widest">NOVO ITEM INCLUÍDO</span></div>}
        </div>
        <div className="flex items-center space-x-2 mb-2"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div><span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{tagInv || 'PENDENTE'}</span></div>
        <h2 className="text-xl font-black uppercase tracking-tight leading-tight mb-6 text-white italic">{workingAsset['DESCRICAO'] || workingAsset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || 'ITEM SEM DESCRIÇÃO'}</h2>
        
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-black/20 border border-white/10 p-4 rounded-[1.8rem] backdrop-blur-md">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Plaqueta Original</p>
              <p className="text-xl font-black font-mono tracking-tighter text-white truncate">{originalPlaqueta}</p>
           </div>
           <div className="bg-black/20 border border-white/10 p-4 rounded-[1.8rem] backdrop-blur-md">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Tag Coletada</p>
              <p className={`text-xl font-black font-mono tracking-tighter truncate ${workingAsset.PLAQUETA_INVENTARIO ? 'text-white' : 'text-white/20 italic'}`}>{workingAsset.PLAQUETA_INVENTARIO || '---'}</p>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar pb-40 relative z-10">
        <div className="grid grid-cols-1 gap-3">
          {displayFields.map(([key, value]) => {
            const formatted = formatValue(String(key), value);
            const keyStr = String(key);
            const isEmpty = value === undefined || value === null || value === '---' || value === '';
            return (
              <div key={keyStr} onClick={() => { setEditingField(keyStr); setEditValue(String(value || '').toUpperCase()); }} className={`p-4 border rounded-[1.8rem] transition-all active:scale-[0.98] ${editingField === keyStr ? 'bg-slate-800 border-indigo-500' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center justify-between mb-1.5"><label className={`text-[9px] font-black uppercase tracking-[0.2em] ${isEmpty ? 'text-slate-600' : 'text-indigo-400'}`}>{keyStr.replace(/_/g, ' ')}</label><Edit2 size={10} className="text-slate-700" /></div>
                {editingField === keyStr ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} className="flex-1 bg-slate-950 p-4 border border-indigo-600 rounded-2xl text-[12px] font-black uppercase text-white outline-none" placeholder="DIGITE..." />
                    <button onClick={applyFieldEdit} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center"><Check size={24}/></button>
                  </div>
                ) : <p className={`text-[13px] font-bold uppercase break-words leading-tight ${isEmpty ? 'text-slate-700 italic' : 'text-slate-200'}`}>{isEmpty ? 'TOQUE PARA PREENCHER' : formatted}</p>}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/90 backdrop-blur-md border-t border-slate-900 flex items-center justify-between z-30">
         <div className="flex items-center"><ShieldCheck size={14} className="text-slate-800 mr-2" /><span className="text-[8px] font-black text-slate-800 uppercase tracking-[0.4em]">GBR Security Core v4.5</span></div>
         <button onClick={handleFinalize} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-2"><Save size={18} /><span>{isNewItem ? 'Confirmar Cadastro' : 'Gravar Alterações'}</span></button>
      </div>
    </div>
  );
};

export default AssetDetail;
