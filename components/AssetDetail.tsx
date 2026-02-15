
import React, { useState } from 'react';
import { Asset } from '../types';
import { ChevronLeft, Edit2, Volume2, X, CheckCircle, Save, Database, ShieldCheck, Activity, Hash, Tag as TagIcon } from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
}

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate }) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const plaqueta = asset['PLAQUETA'] || asset['ETIQUETA'] || asset['PATRIMONIO'] || '---';
  const descricao = asset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || asset['DESCRICAO'] || 'DESCRIÇÃO TÉCNICA INDISPONÍVEL';
  const isConferido = !!asset._conferido;
  const tagInv = asset.TAG_INVENTARIO;

  const handleSave = () => {
    if (editingField) {
      onUpdate({ ...asset, [editingField]: editValue.toUpperCase(), _conferido: true, _corrigido: true });
      setEditingField(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn overflow-hidden">
      {/* Header Resumido */}
      <div className="px-6 pt-12 pb-6 bg-slate-900 text-white relative">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-xl mb-6 text-white active:scale-90"><ChevronLeft size={20} /></button>
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ficha Patrimonial</span>
          {isConferido && <CheckCircle size={14} className="text-emerald-500" />}
        </div>
        <h2 className="text-xl font-bold uppercase tracking-tight leading-tight mb-4">{descricao}</h2>
        
        <div className="grid grid-cols-2 gap-2 mb-4">
           <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tag Identificador</p>
              <p className="text-2xl font-bold font-mono tracking-tighter text-white">{plaqueta}</p>
           </div>
           <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-center">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado</p>
              <div className="flex flex-wrap gap-1">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${isConferido ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {isConferido ? 'Conferido' : 'Pendente'}
                </span>
                {tagInv && (
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400`}>
                    {tagInv}
                  </span>
                )}
              </div>
           </div>
        </div>
      </div>

      {/* Grid de Atributos Compacto */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        <div className="grid grid-cols-2 gap-3 pb-20">
          {/* Adicionando campos de TAG explicitamente se existirem para clareza */}
          {['TAG_INVENTARIO', 'TAG_ADOCAO', 'TAG_DUPLICIDADE', 'TAG_PLAQUETA'].map(tagKey => {
            const val = asset[tagKey];
            if (!val) return null;
            return (
              <div key={tagKey} className="p-3 bg-indigo-50/30 border border-indigo-100 rounded-xl col-span-1">
                <div className="flex items-center space-x-1.5 mb-1">
                  <TagIcon size={10} className="text-indigo-400" />
                  <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{tagKey.replace(/_/g, ' ')}</label>
                </div>
                <p className="text-xs font-black text-indigo-700 uppercase leading-tight">
                  {String(val)}
                </p>
              </div>
            );
          })}

          {Object.entries(asset).filter(([k]) => !k.startsWith('_') && k !== 'id' && !['TAG_INVENTARIO', 'TAG_ADOCAO', 'TAG_DUPLICIDADE', 'TAG_PLAQUETA'].includes(k)).map(([key, value]) => (
            <div 
              key={key} 
              onDoubleClick={() => { setEditingField(key); setEditValue(String(value || '').toUpperCase()); }}
              className={`p-3 bg-slate-50 border border-slate-100 rounded-xl ${key.includes('DESCRICAO') ? 'col-span-2' : 'col-span-1'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</label>
                <Edit2 size={10} className="text-slate-300" />
              </div>
              {editingField === key ? (
                <div className="space-y-2">
                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} className="w-full bg-white p-2 border border-indigo-200 rounded text-xs font-bold uppercase outline-none" />
                  <div className="flex space-x-1">
                    <button onClick={handleSave} className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-[9px] font-bold uppercase">OK</button>
                    <button onClick={() => setEditingField(null)} className="px-2 py-1.5 bg-slate-200 text-slate-500 rounded text-[9px] uppercase"><X size={12}/></button>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-800 uppercase break-words leading-tight">
                  {String(value || '---')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Branding Footer */}
      <div className="p-6 border-t border-slate-50 flex items-center justify-center">
         <ShieldCheck size={14} className="text-slate-200 mr-2" />
         <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Security Core</span>
      </div>
    </div>
  );
};

export default AssetDetail;
