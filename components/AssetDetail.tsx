
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { ChevronLeft, Edit2, X, CheckCircle, Tag as TagIcon, ShieldCheck, Calendar } from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
}

const PLAQUETA_KEYS = ['PLAQUETA', 'ETIQUETA', 'PATRIMONIO', 'TAG', 'BEM', 'COD_BEM'];

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate }) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Função para formatar datas (DD/MM/AAAA), tratando inclusive números seriais do Excel
  const formatValue = (key: string, val: any): string => {
    if (!val || val === '---' || val === '0' || val === 'NULL') return '---';
    const strVal = String(val).trim();
    
    // Identifica campos de data por nome (DATA, DT, VENCIMENTO, etc)
    const isDateField = key.toUpperCase().includes('DATA') || 
                        key.toUpperCase().includes('DT_') || 
                        key.toUpperCase().includes('VENCIMENTO');

    if (isDateField) {
      // Caso seja número serial do Excel (ex: 41639)
      if (!isNaN(Number(strVal)) && Number(strVal) > 30000 && Number(strVal) < 60000) {
        const date = new Date((Number(strVal) - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
      }
      // Caso seja string de data ISO ou similar
      const d = new Date(strVal);
      if (!isNaN(d.getTime()) && (strVal.includes('-') || strVal.includes('/'))) {
        return d.toLocaleDateString('pt-BR');
      }
    }
    return strVal;
  };

  const plaquetaOriginal = useMemo(() => {
    for (const key of PLAQUETA_KEYS) {
      if (asset[key]) return String(asset[key]);
    }
    return '---';
  }, [asset]);

  const plaquetaInventario = asset.PLAQUETA_INVENTARIO || null;
  const descricao = asset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || asset['DESCRICAO'] || 'DESCRIÇÃO TÉCNICA INDISPONÍVEL';
  const isConferido = !!asset._conferido;

  const handleSave = () => {
    if (editingField) {
      const isTagField = PLAQUETA_KEYS.includes(editingField.toUpperCase());
      const updates: any = { ...asset, _conferido: true, _corrigido: true };
      
      if (isTagField) {
        // Se for um campo de etiqueta, preservamos o original e salvamos a nova no campo de inventário
        updates.PLAQUETA_INVENTARIO = editValue.toUpperCase();
      } else {
        updates[editingField] = editValue.toUpperCase();
      }

      onUpdate(updates);
      setEditingField(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn overflow-hidden">
      {/* Header Resumido */}
      <div className="px-6 pt-12 pb-6 bg-slate-950 text-white relative">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-xl mb-6 text-white active:scale-90"><ChevronLeft size={20} /></button>
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ficha Patrimonial</span>
          {isConferido && <CheckCircle size={14} className="text-emerald-500" />}
        </div>
        <h2 className="text-xl font-bold uppercase tracking-tight leading-tight mb-4">{descricao}</h2>
        
        <div className="grid grid-cols-2 gap-2 mb-4">
           <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tag Original</p>
              <p className="text-xl font-bold font-mono tracking-tighter text-white">{plaquetaOriginal}</p>
           </div>
           <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-center">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tag Inventário</p>
              <p className={`text-xl font-bold font-mono tracking-tighter ${plaquetaInventario ? 'text-indigo-400' : 'text-slate-600 italic'}`}>
                {plaquetaInventario || '---'}
              </p>
           </div>
        </div>
      </div>

      {/* Grid de Atributos */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        <div className="grid grid-cols-2 gap-3 pb-20">
          {Object.entries(asset).filter(([k]) => !k.startsWith('_') && k !== 'id' && k !== 'PLAQUETA_INVENTARIO').map(([key, value]) => {
            const formatted = formatValue(key, value);
            const isDateField = key.toUpperCase().includes('DATA') || key.toUpperCase().includes('DT_');
            
            return (
              <div 
                key={key} 
                onDoubleClick={() => { setEditingField(key); setEditValue(String(value || '').toUpperCase()); }}
                className={`p-3 bg-slate-50 border border-slate-100 rounded-xl ${key.includes('DESCRICAO') ? 'col-span-2' : 'col-span-1'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</label>
                    {isDateField && <Calendar size={8} className="text-slate-300" />}
                  </div>
                  <Edit2 size={10} className="text-slate-300" />
                </div>
                {editingField === key ? (
                  <div className="space-y-2">
                    <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} className="w-full bg-white p-2 border border-indigo-200 rounded text-xs font-bold uppercase outline-none" />
                    <div className="flex space-x-1">
                      <button onClick={handleSave} className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-[9px] font-bold uppercase">Gravar</button>
                      <button onClick={() => setEditingField(null)} className="px-2 py-1.5 bg-slate-200 text-slate-500 rounded text-[9px] uppercase"><X size={12}/></button>
                    </div>
                  </div>
                ) : (
                  <p className={`text-xs font-bold uppercase break-words leading-tight ${isDateField ? 'text-indigo-600' : 'text-slate-800'}`}>
                    {formatted}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="p-6 border-t border-slate-50 flex items-center justify-center">
         <ShieldCheck size={14} className="text-slate-200 mr-2" />
         <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Security Core</span>
      </div>
    </div>
  );
};

export default AssetDetail;
