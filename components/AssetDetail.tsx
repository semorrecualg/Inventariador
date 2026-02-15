
import React, { useState } from 'react';
import { Asset } from '../types';
import { speakText } from '../services/geminiService';
import { ChevronLeft, Edit2, Volume2, X, CheckCircle, Save, FilePlus, Hash, Database, ShieldCheck, Activity, MapPin } from 'lucide-react';

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

  const DESC_TERMS = ['DESCRICAO_DO_ATIVO_IMOBILIZADO', 'DESCRICAO_DO_ATIVO_INTANGIVEL', 'DESC_SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_ITEM', 'NOME'];
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
  const descSintetica = getRobustValue(DESC_TERMS) || "DESCRIÇÃO TÉCNICA INDISPONÍVEL";
  const empresa = getRobustValue(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO']) || "GBR";
  const qtde = getRobustValue(['QTDE', 'QUANTIDADE', 'QUANT', 'QTD']) || "1";
  const registro = getRobustValue(['REGISTRO', 'COD_ITEM', 'ID_ATIVO', 'CONTROLE']) || "---";
  const dataBaixa = getRobustValue(['DATA_BAIXA', 'DT_BAIXA']);
  const isBaixado = dataBaixa !== null && dataBaixa !== "---";

  const handleSave = () => {
    if (editingField) {
      onUpdate({ ...asset, [editingField]: editValue.toUpperCase(), _conferido: true, _corrigido: true });
      setEditingField(null);
    }
  };

  const handleSpeech = async () => {
    setIsSpeaking(true);
    await speakText(`Consultando ativo etiqueta ${plaqueta || 'sem identificação'}. ${descSintetica}. Status: ${isBaixado ? 'Baixado' : 'Operacional'}.`);
    setTimeout(() => setIsSpeaking(false), 3500);
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
        className={`p-4 rounded-2xl border-2 transition-all group ${isEditing ? 'border-blue-500 bg-blue-50/50 shadow-inner' : isBaixado ? 'border-fuchsia-900/10 bg-fuchsia-50/30' : 'border-gray-50 bg-gray-50/50 hover:border-blue-100'} ${isDescription ? 'col-span-2' : 'col-span-1'}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-1.5">
             <div className={`w-1 h-1 rounded-full ${isEditing ? 'bg-blue-500 animate-ping' : 'bg-gray-300'}`}></div>
             <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">{key.replace(/_/g, ' ')}</label>
          </div>
          {!isEditing && <Edit2 size={10} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
        {isEditing ? (
          <div className="flex flex-col space-y-3">
            <textarea autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} className="w-full bg-white p-3 rounded-xl border-2 border-blue-200 outline-none font-black text-[11px] min-h-[70px] uppercase shadow-inner" />
            <div className="flex space-x-2">
              <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg shadow-blue-100">Atualizar Campo</button>
              <button onClick={() => setEditingField(null)} className="px-4 py-3 bg-gray-100 text-gray-400 rounded-xl"><X size={14}/></button>
            </div>
          </div>
        ) : (
          <span className={`font-black uppercase break-words leading-tight text-[11px] font-mono ${isBaixado ? 'text-fuchsia-900' : 'text-slate-800'}`}>
            {String(value || '---').toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative overflow-hidden w-full">
      {/* Header Estilo Dashboard Industrial */}
      <div className={`relative h-72 p-6 flex flex-col justify-end transition-all overflow-hidden ${isBaixado ? 'bg-fuchsia-900' : isNew ? 'bg-slate-900' : 'bg-blue-900'}`}>
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none scale-150 rotate-12">
           <Database size={160} />
        </div>
        
        <button onClick={onBack} className="absolute top-6 left-6 z-[60] p-3.5 bg-white/10 backdrop-blur-xl rounded-2xl text-white border border-white/20 active:scale-90 transition-all shadow-2xl"><ChevronLeft size={24} strokeWidth={4} /></button>
        <button onClick={handleSpeech} disabled={isSpeaking} className={`absolute top-6 right-6 z-[60] p-3 rounded-2xl border transition-all ${isSpeaking ? 'bg-emerald-500 text-white animate-pulse' : 'bg-white/10 text-white border-white/20'}`}><Volume2 size={20} /></button>
        
        <div className="text-white z-10 relative">
          <div className="flex gap-2 mb-4">
            {isBaixado && <span className="bg-yellow-400 text-fuchsia-950 text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] shadow-lg animate-pulse">ALERTA: BAIXADO</span>}
            {isNew && <span className="bg-purple-600 text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-lg">NOVA INCLUSÃO</span>}
            {asset._conferido && !isNew && !isBaixado && <span className="bg-emerald-500 text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-lg">VALIDADO FISICAMENTE</span>}
          </div>
          
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-none mb-6 drop-shadow-xl line-clamp-3 break-words italic">{descSintetica}</h2>
          
          <div className="bg-black/30 backdrop-blur-2xl p-5 rounded-[2rem] border border-white/10 grid grid-cols-2 gap-4 shadow-2xl">
             <div className="flex flex-col">
                <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em]">Unidade Master</span>
                <div className="flex items-center space-x-2">
                   <ShieldCheck size={12} className="text-blue-400" />
                   <b className="text-white text-xs truncate uppercase tracking-tight">{empresa}</b>
                </div>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em]">Etiqueta/Plaqueta</span>
                <div className="flex items-center space-x-2">
                   <Hash size={12} className="text-yellow-400" />
                   <b className="text-white text-xl font-mono leading-none tracking-tighter">{plaqueta}</b>
                </div>
             </div>
             <div className="flex flex-col">
                <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em]">Cód. Auxiliar</span>
                <div className="flex items-center space-x-2">
                   <Activity size={12} className="text-emerald-400" />
                   <b className="text-white text-xs font-mono">{registro}</b>
                </div>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em]">Quantidade</span>
                <div className="flex items-center space-x-2">
                   <MapPin size={12} className="text-purple-400" />
                   <b className="text-white text-xs uppercase">{qtde} UNIDADES</b>
                </div>
             </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
      </div>

      <div className="p-6 -mt-8 bg-white rounded-t-[3rem] flex-1 shadow-2xl overflow-y-auto no-scrollbar pb-16 relative z-20 w-full">
        <div className="flex items-center space-x-2 mb-6 ml-2">
           <div className="w-1.5 h-8 bg-blue-600 rounded-full"></div>
           <div>
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none">Memorial de Atributos</h4>
              <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mt-1">Clique duplo nos campos para retificação contábil</p>
           </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.keys(asset).filter(k => k !== 'id' && !k.startsWith('_')).map(key => renderField(key, asset[key]))}
        </div>
      </div>
      
      {/* Branding Footer */}
      <div className="p-6 bg-white border-t border-gray-100 flex flex-col items-center">
        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.5em] mb-2 italic">GBR Intelligence Asset Management</p>
        <div className="h-1 w-16 bg-blue-100 rounded-full"></div>
      </div>
    </div>
  );
};

export default AssetDetail;
