
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { speakText } from '../services/geminiService';
import { ChevronLeft, Edit2, Volume2, Save, X, Info, Calendar, CheckCircle, MapPin, Type, AlertTriangle, FileWarning, Clock, Layers, Database, Building2, FilePlus } from 'lucide-react';

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

  // Termos para identificação visual dinâmica
  const ADDRESS_TERMS = ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'LOCALIZAÇÃO', 'SETOR', 'COD_END'];
  const DESC_TERMS = ['DESC_SINTETICA', 'SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_ITEM', 'NOME'];
  const PLAQUETA_TERMS = ['PLAQUETA', 'PATRIMONIO', 'REGISTRO', 'CODIGO', 'TAG', 'BEM'];
  const INDICE_TERMS = ['INDICE', 'ÍNDICE', 'ID_ATIVO', 'CONTROLE'];
  const COMPANY_TERMS = [
    'RAZAO_SOCIAL', 'EMPRESA', 'NOME_EMPRESA', 'RAZAO_SOC', 
    'CLIENTE', 'UNIDADE', 'RAZAO', 'SOCIAL', 'FANTASIA', 
    'IDENTIFICACAO', 'FILIAL', 'NOME'
  ];

  const getRobustValue = (terms: string[]) => {
    const keys = Object.keys(asset);
    const normTerms = terms.map(t => t.toUpperCase());
    
    // Busca exata primeiro
    for (const k of keys) {
      if (normTerms.includes(k.toUpperCase())) {
        const val = asset[k];
        if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "0") {
          return String(val).trim().toUpperCase();
        }
      }
    }
    // Busca parcial
    const keywords = ['EMPRESA', 'RAZAO', 'SOCIAL', 'UNID', 'FANTASIA', 'IDENTIF'];
    for (const k of keys) {
      if (keywords.some(kw => k.toUpperCase().includes(kw))) {
        const val = asset[k];
        if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "0") {
          return String(val).trim().toUpperCase();
        }
      }
    }
    return null;
  };

  const plaqueta = getRobustValue(PLAQUETA_TERMS);
  const isIntDup = !!asset._isInternalDuplicate;
  const isExtDup = !!asset._isExternalDuplicate;
  const isNew = !!asset._isNew;
  const razao = getRobustValue(COMPANY_TERMS);

  const startEditing = (key: string, value: any) => {
    if (key === 'id' || key.startsWith('_')) return;
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
    }
  };

  const handleSpeech = async () => {
    setIsSpeaking(true);
    const desc = getItemDescription().text;
    const text = `Ativo ${plaqueta || asset.id}. Empresa ${razao || 'não identificada'}. Descrição: ${desc}`;
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
    const isAddress = ADDRESS_TERMS.includes(key.toUpperCase());
    const isIndice = INDICE_TERMS.includes(key.toUpperCase());
    const isCompany = COMPANY_TERMS.includes(key.toUpperCase());

    return (
      <div 
        key={key} 
        onDoubleClick={() => !isEditing && startEditing(key, value)} 
        className={`p-4 rounded-2xl border transition-all relative group h-full 
          ${isEditing ? 'border-blue-500 bg-blue-50/30 ring-4 ring-blue-50' : 'border-gray-100 bg-gray-50/50'} 
          ${!isEditing ? 'hover:bg-white hover:border-blue-200 cursor-pointer shadow-sm' : ''} 
          ${isIndice && (isIntDup || isExtDup) ? 'border-red-200 bg-red-50/40 ring-1 ring-red-100' : ''}`}
      >
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center">
            {isIndice ? <Layers size={10} className="mr-1 text-blue-500" /> : 
             isAddress ? <MapPin size={10} className="mr-1 text-emerald-500" /> :
             isCompany ? <Building2 size={10} className="mr-1 text-indigo-500" /> :
             <Database size={10} className="mr-1 text-gray-300" />}
            {key.replace(/_/g, ' ').toUpperCase()}
          </label>
          {!isEditing && <Edit2 size={10} className="text-blue-500 opacity-20 group-hover:opacity-100" />}
        </div>

        {isEditing ? (
          <div className="flex flex-col space-y-3">
            <textarea 
              autoFocus 
              value={editValue} 
              onChange={(e) => setEditValue(e.target.value.toUpperCase())} 
              className="w-full bg-white p-3 rounded-xl border border-blue-200 outline-none font-black text-xs min-h-[80px] uppercase shadow-inner" 
            />
            <div className="flex space-x-2">
              <button onClick={handleSave} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 flex items-center justify-center active:scale-95 transition-all">
                <Save size={16} className="mr-2"/>Salvar
              </button>
              <button onClick={() => setEditingField(null)} className="px-5 py-4 bg-gray-200 text-gray-600 rounded-xl font-black text-[10px] uppercase active:scale-95 transition-all">
                <X size={16}/>
              </button>
            </div>
          </div>
        ) : (
          <span className={`font-black uppercase text-gray-800 break-all ${isIndice ? 'text-blue-700' : isCompany ? 'text-indigo-900' : ''}`}>
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
      <div className={`relative h-64 p-6 flex flex-col justify-end transition-colors duration-500 ${isNew ? 'bg-gradient-to-br from-purple-700 to-indigo-900' : isIntDup || isExtDup ? 'bg-gradient-to-br from-red-700 to-red-900' : 'bg-gradient-to-br from-blue-700 to-indigo-800'}`}>
        <button onClick={onBack} className="absolute top-6 left-6 p-2.5 bg-white/20 backdrop-blur-md rounded-2xl text-white active:bg-white/40"><ChevronLeft size={22} /></button>
        <button onClick={handleSpeech} disabled={isSpeaking} className="absolute top-6 right-6 p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white active:bg-white/40"><Volume2 size={24} /></button>
        
        <div className="text-white relative z-10">
          <div className="flex flex-wrap gap-2 mb-4">
            {isNew && <span className="bg-purple-600 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-purple-500/50 flex items-center shadow-lg"><FilePlus size={10} className="mr-1"/>INCLUSÃO</span>}
            {asset._conferido && !isNew && <span className="bg-emerald-600 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-emerald-500/50 flex items-center shadow-lg"><CheckCircle size={10} className="mr-1"/>CONFERIDO</span>}
            {asset._corrigido && <span className="bg-blue-500 text-white text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-blue-400/50 flex items-center shadow-lg"><Edit2 size={10} className="mr-1"/>HIGIENIZADO</span>}
            {(isIntDup || isExtDup) && <span className="bg-white text-red-700 text-[9px] px-2.5 py-1 rounded-full font-black uppercase border border-red-500/50 flex items-center shadow-lg"><AlertTriangle size={10} className="mr-1"/>DUPLICIDADE</span>}
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight leading-tight mb-2 line-clamp-2">{currentDesc.text}</h2>
          <div className="flex items-center space-x-6 opacity-80 bg-black/20 p-3 rounded-2xl w-fit backdrop-blur-md border border-white/10">
            <div className="flex flex-col">
              <span className="text-[7px] font-bold uppercase tracking-widest text-white/60">Plaqueta Principal</span>
              <span className="text-[12px] font-black uppercase">{plaqueta || 'S/P'}</span>
            </div>
            <div className="w-px h-6 bg-white/20"></div>
            <div className="flex flex-col">
              <span className="text-[7px] font-bold uppercase tracking-widest text-white/60">Razão Social</span>
              <span className="text-[12px] font-black uppercase text-indigo-200">{razao || 'NÃO IDENTIFICADA'}</span>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none"></div>
      </div>

      <div className="p-6 -mt-8 bg-white rounded-t-[3rem] flex-1 shadow-2xl overflow-y-auto no-scrollbar pb-10 relative z-20">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Dicionário de Dados</h4>
            <div className="flex items-center space-x-1 text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">
              <Edit2 size={8}/> <span>Duplo clique p/ Editar</span>
            </div>
          </div>

          {isNew && (
             <div className="bg-purple-50 p-5 rounded-[2rem] border-2 border-purple-100 flex items-start space-x-4">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
                <FilePlus size={24} />
              </div>
              <div className="flex flex-col">
                <p className="text-[11px] font-black text-purple-700 uppercase mb-1">Novo Ativo Identificado</p>
                <p className="text-[10px] font-bold text-purple-500 uppercase leading-relaxed">Este item foi adicionado manualmente durante a conferência física e não constava na base original.</p>
              </div>
            </div>
          )}

          {(isIntDup || isExtDup) && (
            <div className="bg-red-50 p-5 rounded-[2rem] border-2 border-red-100 flex items-start space-x-4 animate-fadeIn">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex flex-col">
                <p className="text-[11px] font-black text-red-700 uppercase mb-1">Conflito de Registro</p>
                <p className="text-[10px] font-bold text-red-500 uppercase leading-relaxed">
                  {isIntDup ? "⚠️ Este índice possui múltiplos registros nesta unidade." : "⚠️ Este índice aparece em múltiplas unidades da empresa."}
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
