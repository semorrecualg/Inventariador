
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { speakText } from '../services/geminiService';
import { ChevronLeft, Edit2, Volume2, Save, X, Info, Calendar, CheckCircle, MapPin, Type, AlertTriangle, FileWarning, Clock, Layers } from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onUpdate: (asset: Asset) => void;
  availableAddresses?: string[];
}

const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onUpdate, availableAddresses = [] }) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const ADDRESS_TERMS = ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'LOCALIZAÇÃO', 'SETOR', 'COD_END'];
  const DESC_TERMS = ['DESC_SINTETICA', 'SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_ITEM', 'NOME'];
  const PLAQUETA_TERMS = ['PLAQUETA', 'PATRIMONIO', 'REGISTRO', 'CODIGO'];
  const INDICE_TERMS = ['INDICE', 'ÍNDICE'];

  const isAddressKey = (key: string) => ADDRESS_TERMS.includes(key.toUpperCase());
  const isDescKey = (key: string) => DESC_TERMS.includes(key.toUpperCase());
  const isEditable = (key: string) => isAddressKey(key) || isDescKey(key);

  const getRobustValue = (terms: string[]) => {
    const keys = Object.keys(asset);
    for (const term of terms) {
      const match = keys.find(k => k.toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).toUpperCase();
    }
    return null;
  };

  const plaqueta = getRobustValue(PLAQUETA_TERMS);
  const hasPlaqueta = !!plaqueta;
  const isIntDup = !!asset._isInternalDuplicate;
  const isExtDup = !!asset._isExternalDuplicate;
  const indice = getRobustValue(INDICE_TERMS);

  const startEditing = (key: string, value: any) => {
    if (!isEditable(key)) return;
    setEditingField(key);
    setEditValue(String(value || '').toUpperCase());
  };

  const handleSave = () => {
    if (editingField) {
      onUpdate({ 
        ...asset, 
        [editingField]: editValue.toUpperCase(),
        _conferido: true,
        _corrigido: true
      });
      setEditingField(null);
      onBack();
    }
  };

  const handleSpeech = async () => {
    setIsSpeaking(true);
    const desc = getItemDescription().text;
    const text = `Ativo ${plaqueta || asset.id}. Índice ${indice || 'não informado'}. Descrição: ${desc}`;
    await speakText(text);
    setTimeout(() => setIsSpeaking(false), 3000);
  };

  const getItemDescription = () => {
    const keys = Object.keys(asset);
    const match = keys.find(k => DESC_TERMS.some(term => k.toUpperCase() === term.toUpperCase()));
    return { 
      text: match ? String(asset[match]).toUpperCase() : 'SEM DESCRIÇÃO',
      key: match 
    };
  };

  const renderField = (key: string, value: any) => {
    if (key === 'id' || key.startsWith('_')) return null;
    
    const isEditing = editingField === key;
    const canEdit = isEditable(key);
    const isAddress = isAddressKey(key);
    const isIndice = INDICE_TERMS.includes(key.toUpperCase());

    return (
      <div key={key} onDoubleClick={() => canEdit && !isEditing && startEditing(key, value)} className={`p-4 rounded-2xl border transition-all relative group h-full ${isEditing ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100 bg-gray-50/50'} ${canEdit && !isEditing ? 'hover:bg-white hover:border-blue-200 cursor-pointer shadow-sm' : ''} ${isIndice && (isIntDup || isExtDup) ? 'border-red-200 bg-red-50/40 ring-1 ring-red-100' : ''}`}>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center">
            {isIndice && <Layers size={10} className="mr-1 text-blue-500" />}
            {key.toUpperCase()}
          </label>
          {canEdit && !isEditing && <Edit2 size={10} className="text-blue-500 opacity-40 group-hover:opacity-100" />}
        </div>
        {isEditing ? (
          <div className="flex flex-col space-y-3">
            {isAddress ? (
              <div className="max-h-64 overflow-y-auto no-scrollbar flex flex-col space-y-1.5 p-2 bg-white rounded-xl border border-blue-100">
                {availableAddresses.map(addr => (
                  <button key={addr} onClick={() => setEditValue(addr.toUpperCase())} className={`w-full p-4 rounded-xl text-xs font-black uppercase text-left transition-all border ${editValue === addr.toUpperCase() ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                    {addr}
                  </button>
                ))}
              </div>
            ) : (
              <textarea autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.toUpperCase())} className="w-full bg-white p-3 rounded-xl border border-blue-200 outline-none font-black text-xs min-h-[80px] uppercase" />
            )}
            <div className="flex space-x-2">
              <button onClick={handleSave} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 flex items-center justify-center"><Save size={16} className="mr-2"/>Salvar</button>
              <button onClick={() => setEditingField(null)} className="px-5 py-4 bg-gray-200 text-gray-600 rounded-xl font-black text-[10px] uppercase">Cancelar</button>
            </div>
          </div>
        ) : (
          <span className={`font-black uppercase text-gray-800 break-all ${isIndice ? 'text-blue-700' : ''}`}>
            {String(value || '---').toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  const allKeys = Object.keys(asset).filter(k => k !== 'id' && !k.startsWith('_'));
  const currentDesc = getItemDescription();

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn">
      <div className={`relative h-64 p-6 flex flex-col justify-end transition-colors duration-500 ${isIntDup || isExtDup ? 'bg-gradient-to-br from-red-700 to-red-900' : 'bg-gradient-to-br from-blue-700 to-indigo-800'}`}>
        <button onClick={onBack} className="absolute top-6 left-6 p-2.5 bg-white/20 backdrop-blur-md rounded-2xl text-white active:bg-white/40"><ChevronLeft size={22} /></button>
        <button onClick={handleSpeech} disabled={isSpeaking} className="absolute top-6 right-6 p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white active:bg-white/40"><Volume2 size={24} /></button>
        
        <div className="text-white relative z-10">
          <div className="flex flex-wrap gap-2 mb-4">
            {asset._conferido ? <span className="bg-emerald-600 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-emerald-500/50 flex items-center"><CheckCircle size={10} className="mr-1"/>INVENTARIADO</span> : <span className="bg-amber-500 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-amber-400/50 flex items-center"><Clock size={10} className="mr-1"/>PENDENTE</span>}
            {isIntDup && <span className="bg-white text-red-700 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-red-500/50 flex items-center shadow-lg"><AlertTriangle size={10} className="mr-1"/>DUPLICIDADE INTERNA</span>}
            {isExtDup && <span className="bg-orange-500 text-white text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-orange-400/50 flex items-center shadow-lg"><AlertTriangle size={10} className="mr-1"/>DUPLICIDADE EXTERNA</span>}
            {!hasPlaqueta && <span className="bg-purple-600 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-purple-500/50 flex items-center"><FileWarning size={10} className="mr-1"/>SEM PLAQUETA</span>}
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight leading-tight mb-2 line-clamp-2">{currentDesc.text}</h2>
          <div className="flex items-center space-x-6 opacity-80 bg-black/10 p-3 rounded-2xl w-fit backdrop-blur-sm">
            <div className="flex flex-col">
              <span className="text-[7px] font-bold uppercase tracking-widest text-white/60">Plaqueta</span>
              <span className="text-[12px] font-black uppercase">{plaqueta || 'S/P'}</span>
            </div>
            <div className="w-px h-6 bg-white/20"></div>
            <div className="flex flex-col">
              <span className="text-[7px] font-bold uppercase tracking-widest text-white/60">Índice</span>
              <span className="text-[12px] font-black uppercase text-blue-200">{indice || '---'}</span>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>
      </div>

      <div className="p-6 -mt-8 bg-white rounded-t-[3rem] flex-1 shadow-2xl overflow-y-auto no-scrollbar pb-10 relative z-20">
        <div className="space-y-4">
          {(isIntDup || isExtDup) && (
            <div className="bg-red-50 p-5 rounded-[2rem] border-2 border-red-100 flex items-start space-x-4 animate-fadeIn">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex flex-col">
                <p className="text-[11px] font-black text-red-700 uppercase mb-1">Alerta de Integridade do Índice</p>
                <p className="text-[10px] font-bold text-red-500 uppercase leading-relaxed">
                  {isIntDup && "⚠️ Este índice já está cadastrado em outro ativo desta mesma unidade."}
                  {isExtDup && "🌍 Este índice foi detectado em outra empresa/unidade da base."}
                </p>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-4">
            {allKeys.map(key => renderField(key, asset[key]))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
