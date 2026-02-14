
import React, { useState } from 'react';
import { Asset } from '../types';
import { speakText } from '../services/geminiService';
import { ChevronLeft, Edit2, Volume2, X, CheckCircle, Save, FilePlus, Hash } from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  availableAddresses?: string[];
}

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate }) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const DESC_TERMS = [
    'DESCRICAO_DO_ATIVO_IMOBILIZADO', 
    'DESCRICAO_DO_ATIVO_INTANGIVEL', 
    'DESC_SINTETICA', 
    'DESCRICAO', 
    'DESCRIÇÃO', 
    'DESC_ITEM', 
    'NOME'
  ];
  
  const PLAQUETA_TERMS = ['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'REGISTRO', 'CODIGO', 'TAG', 'BEM'];

  const getRobustValue = (terms: string[]) => {
    const normTerms = terms.map(t => t.toUpperCase());
    for (const term of normTerms) {
       const foundKey = Object.keys(asset).find(k => 
         k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_') === term
       );
       if (foundKey && asset[foundKey] !== undefined && asset[foundKey] !== null && String(asset[foundKey]).trim() !== "") {
           return String(asset[foundKey]).trim().toUpperCase();
       }
    }
    return null;
  };

  const plaqueta = getRobustValue(PLAQUETA_TERMS);
  const isNew = !!asset._isNew;
  const descSintetica = getRobustValue(DESC_TERMS) || "SEM DESCRIÇÃO";
  const empresa = getRobustValue(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO']) || "GBR";
  const qtde = getRobustValue(['QTDE', 'QUANTIDADE', 'QUANT', 'QTD']) || "1";
  const registro = getRobustValue(['REGISTRO', 'COD_ITEM', 'ID_ATIVO', 'CONTROLE']) || "---";

  const handleSave = () => {
    if (editingField) {
      onUpdate({ ...asset, [editingField]: editValue.toUpperCase(), _conferido: true, _corrigido: true });
      setEditingField(null);
    }
  };

  const handleSpeech = async () => {
    setIsSpeaking(true);
    await speakText(`Ativo etiqueta ${plaqueta || 'sem plaqueta'}. ${descSintetica}.`);
    setTimeout(() => setIsSpeaking(false), 3000);
  };

  const renderField = (key: string, value: any) => {
    if (key === 'id' || key.startsWith('_')) return null;
    const isEditing = editingField === key;
    const normalizedKey = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
    const isDescription = DESC_TERMS.includes(normalizedKey);

    return (
      <div 
        key={key} 
        onDoubleClick={() => { setEditingField(key); setEditValue(String(value || '').toUpperCase()); }} 
        className={`p-3 rounded-xl border transition-all ${isEditing ? 'border-blue-500 bg-blue-50/30' : 'border-gray-50 bg-gray-50/30'} ${isDescription ? 'col-span-2' : 'col-span-1'}`}
      >
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[7px] font-black text-gray-300 uppercase tracking-widest">{key.replace(/_/g, ' ')}</label>
          {!isEditing && <Edit2 size={8} className="text-blue-300 opacity-30" />}
        </div>
        {isEditing ? (
          <div className="flex flex-col space-y-2">
            <textarea autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} className="w-full bg-white p-2 rounded-lg border border-blue-200 outline-none font-black text-[10px] min-h-[50px] uppercase" />
            <div className="flex space-x-1.5">
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded-md font-black text-[8px] uppercase">Salvar</button>
              <button onClick={() => setEditingField(null)} className="px-2 py-2 bg-gray-100 text-gray-500 rounded-md"><X size={10}/></button>
            </div>
          </div>
        ) : (
          <span className="font-black uppercase text-gray-800 break-words leading-tight text-[10px]">
            {String(value || '---').toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative overflow-hidden w-full">
      <div className={`relative h-56 p-4 flex flex-col justify-end transition-all ${isNew ? 'bg-indigo-900' : 'bg-emerald-800'}`}>
        <button onClick={onBack} className="absolute top-4 left-4 z-[60] p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/10"><ChevronLeft size={20} strokeWidth={3} /></button>
        <button onClick={handleSpeech} disabled={isSpeaking} className="absolute top-4 right-4 z-[60] p-2 bg-white/10 backdrop-blur-md rounded-lg text-white"><Volume2 size={16} /></button>
        
        <div className="text-white z-10">
          <div className="flex gap-2 mb-2">
            {isNew && <span className="bg-purple-600/50 text-[6px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-white/20">NOVO</span>}
            {asset._conferido && !isNew && <span className="bg-emerald-600/50 text-[6px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-white/20">CONFERIDO</span>}
          </div>
          <h2 className="text-base font-black uppercase tracking-tight leading-tight mb-2 drop-shadow-md line-clamp-2 break-words">{descSintetica}</h2>
          <div className="bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/10 grid grid-cols-2 gap-2 text-[7px] font-bold text-white/60">
             <div>EMP: <b className="text-white">{empresa.slice(0, 20)}</b></div>
             <div className="text-right">QTD: <b className="text-white">{qtde}</b></div>
             <div>CÓD: <b className="text-white">{registro}</b></div>
             <div className="text-right flex items-center justify-end space-x-1">
                <span className="text-[8px] font-black uppercase opacity-60">ETIQUETA:</span> <b className="text-white text-[12px]">{plaqueta}</b>
             </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
      </div>

      <div className="p-5 -mt-6 bg-white rounded-t-[2rem] flex-1 shadow-2xl overflow-y-auto no-scrollbar pb-10 relative z-20 w-full">
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(asset).filter(k => k !== 'id' && !k.startsWith('_')).map(key => renderField(key, asset[key]))}
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
