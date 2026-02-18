
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
  Lock
} from 'lucide-react';

// Reuso do formatador de data v24.12
const formatDateBR = (val: any): string => {
  if (!val) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return "";

  if (!isNaN(Number(s)) && Number(s) > 10000) {
    const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (s.includes('-') || s.includes('/')) {
    const parts = s.split(/[/-]/);
    if (parts[0].length === 4) return `${parts[2].substring(0,2)}/${parts[1]}/${parts[0]}`;
    if (parts[2].length === 4) return `${parts[0].substring(0,2)}/${parts[1]}/${parts[2]}`;
  }

  return s.toUpperCase();
};

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  editableFields: string[]; // Protocolo v24.19
}

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate, editableFields }) => {
  const [workingAsset, setWorkingAsset] = useState<Asset>({ ...asset });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    setWorkingAsset({ ...asset });
  }, [asset]);

  const isBaixado = String(workingAsset.STATUS || '').toUpperCase().includes('BAIXADO');
  const isConferido = !!workingAsset._conferido;

  const displayFields = [
    { key: 'EMPRESA', label: 'Empresa', icon: Building2 },
    { key: 'STATUS', label: 'Status Vital', icon: ShieldCheck },
    { key: 'ETIQUETA', label: 'Etiqueta de Patrimônio', icon: FileText },
    { key: 'DESCRICAODOATIVO', label: 'Descrição do Ativo', icon: null },
    { key: 'SERIAL', label: 'Número de Série', icon: null },
    { key: 'DATAAQUSIC', label: 'Data de Aquisição', icon: Calendar },
    { key: 'DATABAIXA', label: 'Data de Baixa', icon: Calendar },
    { key: 'CNPJ', label: 'CNPJ Fornecedor', icon: null },
    { key: 'NOMEFORNECEDOR', label: 'Fornecedor', icon: User },
    { key: 'NOTAFISCAL', label: 'Nota Fiscal', icon: null },
    { key: 'CONTACONTABIL', label: 'Conta Contábil', icon: null },
    { key: 'PRIMARYKEY', label: 'Chave Primária', icon: null },
    { key: 'ENDERECO', label: 'Localização Física', icon: MapPin }
  ];

  const applyFieldEdit = () => {
    if (editingField) {
      const updates: any = { ...workingAsset };
      const newValue = editValue.toUpperCase().trim();
      
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
    const finalAsset: Asset = { ...workingAsset, _conferido: true };
    onUpdate(finalAsset);
    onBack();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className={`px-6 pt-12 pb-8 ${isBaixado ? 'bg-red-900' : isConferido ? 'bg-emerald-900' : 'bg-slate-900'} text-white relative shadow-2xl z-20`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-3 bg-white/10 rounded-2xl active:scale-90"><X size={20} /></button>
          <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-full border border-white/10">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/90">Audit Control v24.19</span>
          </div>
        </div>
        
        <h2 className="text-2xl font-black uppercase tracking-tight leading-tight mb-6 text-white italic">
            {workingAsset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO'}
        </h2>
        
        <div className="bg-black/20 border border-white/10 p-5 rounded-[2rem] backdrop-blur-md flex items-center justify-between">
           <div>
              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Identificador Único</p>
              <div className="flex items-center space-x-2">
                <Hash size={20} className="text-white/60" />
                <p className="text-2xl font-black font-mono tracking-tighter text-white">{workingAsset.ETIQUETA || 'S/ ETQ'}</p>
              </div>
           </div>
           <div className={`px-4 py-2 rounded-xl border font-black text-[10px] uppercase tracking-widest ${isConferido ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/10 text-white/70 border-white/10'}`}>
              {workingAsset.TAG_INVENTARIO || (isConferido ? 'VERIFICADO' : 'PENDENTE')}
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar pb-40 relative z-10">
          {displayFields.map(({ key, label, icon: Icon }) => {
            const isDateField = key === 'DATAAQUSIC' || key === 'DATABAIXA';
            const rawVal = workingAsset[key];
            const displayVal = isDateField ? formatDateBR(rawVal) : (rawVal || '---');
            const isAltered = (workingAsset._camposAlterados || []).includes(key);
            
            // Protocolo v24.19: Verificação de Permissão de Edição
            const canEdit = editableFields.includes(key);

            if (!rawVal && key === 'DATABAIXA') return null;

            return (
              <div 
                key={key} 
                onClick={() => { 
                  if (canEdit) {
                    setEditingField(key); 
                    setEditValue(String(rawVal || '')); 
                  }
                }} 
                className={`p-4 border rounded-[1.8rem] transition-all ${editingField === key ? 'bg-slate-800 border-indigo-500 shadow-2xl scale-[1.02]' : canEdit ? 'bg-slate-900 border-slate-800 active:scale-[0.98]' : 'bg-slate-950 border-slate-900 opacity-60'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      {Icon && <Icon size={12} className={canEdit ? "text-slate-400" : "text-slate-700"} />}
                      <label className={`text-[9px] font-black uppercase tracking-[0.2em] ${canEdit ? "text-slate-500" : "text-slate-700"}`}>{label}</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isAltered && (
                        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[7px] font-black uppercase">
                          <AlertCircle size={8} /> <span>Alterado</span>
                        </div>
                      )}
                      {canEdit ? <Edit2 size={10} className="text-indigo-500" /> : <Lock size={10} className="text-slate-800" />}
                    </div>
                </div>
                
                {editingField === key ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFieldEdit()} className="flex-1 bg-slate-950 p-4 border border-indigo-600 rounded-2xl text-[12px] font-black uppercase text-white outline-none" />
                    <button onClick={applyFieldEdit} className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Check size={20}/></button>
                  </div>
                ) : <p className={`text-[13px] font-bold uppercase break-words leading-tight ${canEdit ? "text-slate-200" : "text-slate-600"}`}>{displayVal}</p>}
              </div>
            );
          })}
      </div>
      
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/90 backdrop-blur-md border-t border-slate-900 flex items-center justify-between z-30">
         <div className="text-[8px] font-black text-slate-800 uppercase tracking-[0.4em]">Audit Precision Active</div>
         <button onClick={handleFinalize} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl active:scale-95 flex items-center space-x-2">
            <Save size={18} />
            <span>Salvar Registro</span>
         </button>
      </div>
    </div>
  );
};

export default AssetDetail;
