
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { speakText } from '../services/geminiService';
import { ChevronLeft, Edit2, Volume2, Save, X, Info, Calendar, CheckCircle, MapPin, Type, AlertTriangle, FileWarning, Clock, Layers, Database, Building2, FilePlus, Link2, Box, Hash } from 'lucide-react';

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
  const PLAQUETA_TERMS = ['PLAQUETA', 'PATRIMONIO', 'REGISTRO', 'CODIGO', 'TAG', 'BEM'];
  const INDICE_TERMS = ['INDICE', 'ÍNDICE', 'ID_ATIVO', 'CONTROLE'];
  const COMPANY_TERMS = ['RAZAO_SOCIAL', 'EMPRESA', 'CLIENTE', 'UNIDADE', 'RAZAO'];

  const getRobustValue = (terms: string[]) => {
    const normTerms = terms.map(t => t.toUpperCase());
    for (const term of normTerms) {
       const foundKey = Object.keys(asset).find(k => k.toUpperCase() === term);
       if (foundKey && asset[foundKey] !== undefined && asset[foundKey] !== null && String(asset[foundKey]).trim() !== "") {
           return String(asset[foundKey]).trim().toUpperCase();
       }
    }
    return null;
  };

  const plaqueta = getRobustValue(PLAQUETA_TERMS);
  const isIntDup = !!asset._isInternalDuplicate;
  const isExtDup = !!asset._isExternalDuplicate;
  const isNew = !!asset._isNew;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO";
  
  const descSintetica = getRobustValue(DESC_TERMS) || "SEM DESCRIÇÃO";
  const empresa = getRobustValue(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO']) || "GBR";
  const qtde = getRobustValue(['QTDE', 'QUANTIDADE', 'QUANT', 'QTD']) || "1";
  
  const registro = getRobustValue(['REGISTRO', 'COD_ITEM', 'ID_ATIVO', 'CONTROLE']) || "---";
  const sItem = getRobustValue(['S_ITEM', 'S_ITEM', 'SUB_ITEM', 'SUB']) || "0";
  
  const aquisicao = getRobustValue(['DT.AQUISICAO', 'DT_AQUISICAO', 'DATA_AQUISICAO', 'AQUISICAO', 'DATA']) || "---";
  const situacao = getRobustValue(['STATUS', 'SITUACAO', 'TAG_INVENTARIO']) || "ATIVO";
  const conta = getRobustValue(['DESCRICAO_DA_CONTA', 'DESC_CONTA', 'CONTA_CONTABIL', 'CONTA']) || "NÃO DEF.";
  
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
    const text = `Ativo ${plaqueta || 'sem plaqueta'}. ${descSintetica}.`;
    await speakText(text);
    setTimeout(() => setIsSpeaking(false), 3000);
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
        className={`p-5 rounded-3xl border transition-all relative group h-full 
          ${isEditing ? 'border-blue-500 bg-blue-50/30 ring-4 ring-blue-50' : 'border-gray-100 bg-gray-50/50 shadow-sm'} 
          ${!isEditing ? 'hover:bg-white hover:border-blue-200 cursor-pointer' : ''} 
          ${isIndice && (isIntDup || isExtDup) ? 'border-red-200 bg-red-50/40' : ''}`}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center">
            {isIndice ? <Layers size={10} className="mr-2 text-blue-500" /> : 
             isAddress ? <MapPin size={10} className="mr-2 text-emerald-500" /> :
             isCompany ? <Building2 size={10} className="mr-2 text-indigo-500" /> :
             <Database size={10} className="mr-2 text-gray-300" />}
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
              className="w-full bg-white p-4 rounded-2xl border border-blue-200 outline-none font-black text-sm min-h-[100px] uppercase shadow-inner" 
            />
            <div className="flex space-x-3">
              <button onClick={handleSave} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg flex items-center justify-center active:scale-95 transition-all">
                <Save size={16} className="mr-2"/>Gravar
              </button>
              <button onClick={() => setEditingField(null)} className="px-5 py-4 bg-gray-200 text-gray-600 rounded-2xl font-black text-[10px] uppercase active:scale-95 transition-all">
                <X size={16}/>
              </button>
            </div>
          </div>
        ) : (
          <span className={`font-black uppercase text-gray-800 break-all leading-tight text-sm ${isIndice ? 'text-blue-700' : isCompany ? 'text-indigo-900' : ''}`}>
            {String(value || '---').toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  const allKeys = Object.keys(asset).filter(k => k !== 'id' && !k.startsWith('_'));

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative overflow-hidden">
      <div className={`relative h-80 p-6 flex flex-col justify-end transition-all duration-700 
        ${isNew ? 'bg-gradient-to-br from-purple-800 to-indigo-950' : 
          isAdopted ? 'bg-gradient-to-br from-cyan-600 to-blue-900' :
          isIntDup || isExtDup ? 'bg-gradient-to-br from-red-700 to-red-950' : 
          'bg-gradient-to-br from-emerald-600 to-indigo-950'}`}>
        
        {/* BOTÃO DE VOLTAR REFORÇADO - Z-INDEX ALTO E POSIÇÃO FIXA NO TOPO DO CONTAINER */}
        <button 
          onClick={onBack} 
          className="absolute top-8 left-8 z-[60] p-4 bg-white/20 backdrop-blur-2xl rounded-2xl text-white active:bg-white/40 transition-all border border-white/20 shadow-2xl flex items-center justify-center group"
          aria-label="Voltar"
        >
          <ChevronLeft size={28} strokeWidth={3} className="group-active:scale-90 transition-transform" />
        </button>

        <button onClick={handleSpeech} disabled={isSpeaking} className="absolute top-8 right-8 z-[60] p-3 bg-white/10 backdrop-blur-xl rounded-2xl text-white active:bg-white/30 transition-all border border-white/10 shadow-lg"><Volume2 size={24} /></button>
        
        <div className="text-white relative z-10">
          <div className="flex flex-wrap gap-3 mb-5">
            {isNew && <span className="bg-purple-600/30 backdrop-blur-md text-[9px] px-4 py-1.5 rounded-full font-black uppercase border border-white/30 flex items-center shadow-2xl"><FilePlus size={10} className="mr-2"/>CADASTRO NOVO</span>}
            {isAdopted && <span className="bg-cyan-600/30 backdrop-blur-md text-[9px] px-4 py-1.5 rounded-full font-black uppercase border border-white/30 flex items-center shadow-2xl"><Link2 size={10} className="mr-2"/>BEM ADOTADO</span>}
            {asset._conferido && !isNew && !isAdopted && <span className="bg-emerald-600/30 backdrop-blur-md text-[9px] px-4 py-1.5 rounded-full font-black uppercase border border-white/30 flex items-center shadow-2xl"><CheckCircle size={10} className="mr-2"/>OK! INVENTARIADO</span>}
          </div>

          <h2 className="text-3xl font-black uppercase tracking-tight leading-[1.1] mb-3 drop-shadow-md">{descSintetica}</h2>
          
          <div className="bg-black/20 backdrop-blur-2xl p-5 rounded-[2.5rem] border border-white/10 shadow-2xl space-y-2.5 mb-6">
             <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">EMPRESA: <b className="text-white ml-1.5">{empresa}</b></span>
                <div className="w-1 h-1 rounded-full bg-white/20"></div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">QTDE: <b className="text-white ml-1.5">{qtde}</b></span>
             </div>
             
             <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center bg-white/10 p-2.5 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">COD.ITEM: <b className="text-white ml-1.5">{registro}</b></span>
                <div className="w-1 h-1 rounded-full bg-white/20"></div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">SUB.ITEM: <b className="text-white ml-1.5">{sItem}</b></span>
             </div>

             <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">AQUISIÇÃO: <b className="text-white ml-1.5">{aquisicao}</b></span>
                <div className="w-1 h-1 rounded-full bg-white/20"></div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">SITUAÇÃO: <b className="text-white ml-1.5">{situacao}</b></span>
             </div>
             <div className="pt-2 mt-2 border-t border-white/10">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight leading-relaxed">CONTA CONTÁBIL: <b className="text-blue-300 ml-1.5">{conta}</b></span>
             </div>
          </div>

          <div className="flex items-center space-x-8 bg-white/5 p-5 rounded-[2.2rem] backdrop-blur-2xl border border-white/10 shadow-2xl">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Plaqueta Patrimonial</span>
              <div className="flex items-center space-x-3">
                <Hash size={14} className="text-blue-300" />
                <span className="text-2xl font-black uppercase tracking-tighter leading-none">{plaqueta || 'S/P'}</span>
              </div>
            </div>
            <div className="w-px h-10 bg-white/10"></div>
            <div className="flex flex-col max-w-[180px]">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Unidade de Registro</span>
              <div className="flex items-center space-x-3">
                <Building2 size={14} className="text-indigo-200" />
                <span className="text-[11px] font-black uppercase leading-tight truncate">{empresa || 'GBR PATRIMONIAL'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none"></div>
      </div>

      <div className="p-8 -mt-10 bg-white rounded-t-[3.5rem] flex-1 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] overflow-y-auto no-scrollbar pb-16 relative z-20">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-3">
            <h4 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em]">Especificações Técnicas</h4>
            <div className="flex items-center space-x-2 text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
              <Edit2 size={10}/> <span>Clique duplo p/ Editar</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-5">
            {allKeys.map(key => renderField(key, asset[key]))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
