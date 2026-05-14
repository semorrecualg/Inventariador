
import React from 'react';
import { Asset } from '../types';
import { determineAssetTag, getTagMetadata } from '../services/tagService';
import { 
  ShieldCheck, 
  MapPin, 
  Hash, 
  Calendar, 
  Tag,
  AlertTriangle
} from 'lucide-react';

interface PublicKardexProps {
  asset: Asset;
  onClose?: () => void;
  selectedUnit?: string | null;
}

const formatDateBR = (val: string | number | null | undefined): string => {
  if (!val) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return "";
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  return s.toUpperCase();
};

const PublicKardex: React.FC<PublicKardexProps> = ({ asset, onClose, selectedUnit }) => {
  const isBaixado = String(asset.STATUS || '').toUpperCase().includes('BAIXA') || !!asset.DATABAIXA;
  
  // Regra de Ouro: Determina a Tag e os Metadados (Cores/Legendas)
  const tag = determineAssetTag(asset, asset._localMaster || asset.ENDERECO || "", selectedUnit || asset._unitid || asset.UNIDADE_OPERACIONAL || null);
  const meta = getTagMetadata(tag);
  const TagIcon = meta.icon;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 font-sans animate-fadeIn">
      {/* CARD CONTAINER */}
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        
        {/* HEADER - BRANDING & STATUS COLOR */}
        <div className={`${meta.color.bg.replace('/30', '')} p-8 text-white text-center relative overflow-hidden transition-colors duration-500`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-12 -mb-12 blur-xl" />
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-4 border border-white/30 shadow-2xl overflow-hidden p-1 transform hover:rotate-3 transition-transform">
              <TagIcon className={meta.color.text} size={40} />
            </div>
            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90 mb-1">AUDIT AUTHORITY</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">KARDEX DIGITAL v24.50.3</p>
          </div>
        </div>

        {/* ASSET TITLE SECTION */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full mb-4 border ${meta.color.border} ${meta.color.bg}`}>
            <div className={`w-2 h-2 rounded-full ${meta.color.text.replace('text-', 'bg-')} animate-pulse`} />
            <span className={`text-[10px] font-black uppercase tracking-widest ${meta.color.text}`}>{meta.label}</span>
          </div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-tight mb-2">
            {asset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO'}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            {asset.UNIDADE_OPERACIONAL || asset._unitid || 'UNIDADE NÃO INFORMADA'}
          </p>
        </div>

        {/* REGRA DE OURO: LEGENDA DA SITUAÇÃO */}
        <div className="px-8 mb-4">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center">
              <ShieldCheck size={12} className="mr-1.5 text-accent" /> SITUAÇÃO DO ATIVO
            </p>
            <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase tracking-tight">
              {meta.description}
            </p>
          </div>
        </div>

        {/* MAIN STATS */}
        <div className="px-8 py-2 grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 shadow-inner group transition-all hover:bg-white hover:shadow-md">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 group-hover:text-accent">PLAQUETA</p>
            <p className="text-2xl font-black font-mono text-slate-900 tracking-tighter">{asset.ETIQUETA || '---'}</p>
          </div>
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 shadow-inner group transition-all hover:bg-white hover:shadow-md">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 group-hover:text-accent">ESTADO</p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isBaixado ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'}`} />
              <p className={`text-sm font-black uppercase tracking-tight ${isBaixado ? 'text-red-600' : 'text-emerald-600'}`}>
                {isBaixado ? 'BAIXADO' : 'ATIVO'}
              </p>
            </div>
          </div>
        </div>

        {/* DIVERGÊNCIA CRÍTICA WARNING */}
        {asset._is_divergent_baixa && (
          <div className="mx-8 mt-2 mb-4 bg-red-600 rounded-2xl p-4 flex items-center space-x-3 shadow-lg animate-pulse">
            <AlertTriangle className="text-white shrink-0" size={24} />
            <p className="text-[9px] font-black text-white uppercase leading-tight tracking-wider">
              DIVERGÊNCIA CRÍTICA: Item ATIVO com DATA DE BAIXA ({asset.DATABAIXA}).
            </p>
          </div>
        )}

        {/* DETAILS LIST */}
        <div className="px-8 py-4 space-y-6">
          {asset.ENDERECO && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Local de Origem (Base)</p>
                <p className="text-xs font-black text-slate-800 uppercase leading-tight">{asset.ENDERECO}</p>
              </div>
            </div>
          )}

          {asset._localMaster && asset._localMaster !== asset.ENDERECO && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-100">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">Novo Local (Inventariado)</p>
                <p className="text-xs font-black text-indigo-800 uppercase leading-tight">{asset._localMaster}</p>
              </div>
            </div>
          )}

          {asset.CENTRODECUSTO && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <Tag size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">CENTRO DE CUSTO</p>
                <p className="text-xs font-black text-slate-800 uppercase leading-tight">{asset.CENTRODECUSTO}</p>
              </div>
            </div>
          )}

          {(asset.SERIAL || asset.REGISTRO) && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <Hash size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">SERIAL / REGISTRO</p>
                <p className="text-xs font-black text-slate-800 uppercase leading-tight">
                  {asset.SERIAL || '---'} {asset.REGISTRO ? `| REG: ${asset.REGISTRO}` : ''}
                </p>
              </div>
            </div>
          )}

          {asset.DATAAQUISIC && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">DATA AQUISIÇÃO</p>
                <p className="text-xs font-black text-slate-800 uppercase leading-tight">{formatDateBR(asset.DATAAQUISIC)}</p>
              </div>
            </div>
          )}
        </div>

        {/* AUDIT STATUS FOOTER */}
        <div className="mt-auto p-8 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ÚLTIMA AUDITORIA</span>
              <span className="text-xs font-black text-slate-900 uppercase mt-0.5 flex items-center">
                <Calendar size={12} className="mr-1 text-slate-400" />
                {asset._dataLeitura ? new Date(asset._dataLeitura).toLocaleDateString('pt-BR') : 'PENDENTE'}
              </span>
            </div>
            <div className={`px-5 py-3 rounded-2xl flex items-center space-x-2 shadow-sm border transition-all duration-500 ${meta.color.badge} ${meta.color.border}`}>
              <TagIcon size={16} />
              <span className="text-[11px] font-black uppercase tracking-[0.1em]">
                {meta.label}
              </span>
            </div>
          </div>

          {onClose && (
            <button 
              onClick={onClose}
              className={`w-full py-5 ${meta.color.button.replace('bg-', 'bg-')} rounded-3xl font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-2`}
            >
              <span>FECHAR CONSULTA</span>
            </button>
          )}
        </div>
      </div>

      {/* FOOTER INFO */}
      <div className="mt-8 text-center px-4">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em] mb-2">SISTEMA DE GESTÃO PATRIMONIAL</p>
        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
          © {new Date().getFullYear()} AUDIT AUTHORITY - INTELIGÊNCIA EM AUDITORIA<br/>
          GOVERNANÇA • INTEGRIDADE • SOBERANIA
        </p>
      </div>
    </div>
  );
};

export default PublicKardex;
