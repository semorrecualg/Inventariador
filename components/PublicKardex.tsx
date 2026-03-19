
import React from 'react';
import { Asset } from '../types';
import { 
  ShieldCheck, 
  MapPin, 
  Hash, 
  Calendar, 
  CheckCircle2,
  Clock,
  Tag
} from 'lucide-react';

interface PublicKardexProps {
  asset: Asset;
  onClose?: () => void;
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

const PublicKardex: React.FC<PublicKardexProps> = ({ asset, onClose }) => {
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
  const isBaixado = String(asset.STATUS || '').toUpperCase().includes('BAIXA') || !!asset.DATABAIXA;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 font-sans animate-fadeIn">
      {/* CARD CONTAINER */}
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        
        {/* HEADER - BRANDING */}
        <div className="bg-accent p-8 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-12 -mb-12 blur-xl" />
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 border border-white/30 shadow-lg overflow-hidden p-1">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 mb-1">AUDIT AUTHORITY</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">KARDEX DIGITAL v24.50</p>
          </div>
        </div>

        {/* ASSET TITLE SECTION */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-accent-soft text-accent rounded-full mb-4 border border-accent/10">
            <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest">Ativo Verificado</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-tight mb-2">
            {asset.DESCRICAODOATIVO || 'ITEM SEM DESCRIÇÃO'}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            {asset.EMPRESA || 'UNIDADE NÃO INFORMADA'}
          </p>
        </div>

        {/* MAIN STATS */}
        <div className="px-8 py-4 grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 shadow-inner">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2">PLAQUETA</p>
            <p className="text-2xl font-bold font-mono text-slate-900 tracking-tighter">{asset.ETIQUETA || '---'}</p>
          </div>
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 shadow-inner">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2">STATUS</p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isBaixado ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <p className={`text-xs font-black uppercase tracking-tight ${isBaixado ? 'text-red-600' : 'text-emerald-600'}`}>
                {isBaixado ? 'BAIXADO' : 'ATIVO'}
              </p>
            </div>
          </div>
        </div>

        {/* DETAILS LIST */}
        <div className="px-8 py-4 space-y-6">
          {asset.ENDERECO && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">LOCALIZAÇÃO REGISTRADA</p>
                <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{asset.ENDERECO}</p>
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
                <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{asset.CENTRODECUSTO}</p>
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
                <p className="text-xs font-bold text-slate-800 uppercase leading-tight">
                  {asset.SERIAL || '---'} {asset.REGISTRO ? `| REG: ${asset.REGISTRO}` : ''}
                </p>
              </div>
            </div>
          )}

          {asset.DATAAQUSIC && (
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">DATA AQUISIÇÃO</p>
                <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{formatDateBR(asset.DATAAQUSIC)}</p>
              </div>
            </div>
          )}

          {/* Mostrar outros campos que possam ter sido incluídos no QR Code mas não têm ícone específico */}
          {Object.entries(asset).map(([key, value]) => {
            const skipKeys = ['id', 'ETIQUETA', 'DESCRICAODOATIVO', 'EMPRESA', 'STATUS', 'DATABAIXA', 'ENDERECO', 'CENTRODECUSTO', 'SERIAL', 'REGISTRO', 'DATAAQUSIC', '_conferido', '_dataLeitura', 'AUDITOR_STATUS_CONFERENCIA'];
            if (skipKeys.includes(key) || !value || typeof value === 'object') return null;
            
            return (
              <div key={key} className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{key.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{String(value)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* AUDIT STATUS FOOTER */}
        <div className="mt-auto p-8 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">ÚLTIMA AUDITORIA</span>
              <span className="text-[10px] font-bold text-slate-600 uppercase mt-0.5">
                {asset._dataLeitura ? new Date(asset._dataLeitura).toLocaleDateString('pt-BR') : 'PENDENTE'}
              </span>
            </div>
            <div className={`px-4 py-2 rounded-xl flex items-center space-x-2 ${isConferido ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
              {isConferido ? <CheckCircle2 size={14} /> : <Clock size={14} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isConferido ? 'CONFERIDO' : 'EM AGUARDO'}
              </span>
            </div>
          </div>

          {onClose && (
            <button 
              onClick={onClose}
              className="w-full py-4 bg-accent text-white rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all border-b-4 border-black/20"
            >
              Fechar Consulta
            </button>
          )}
        </div>
      </div>

      {/* FOOTER INFO */}
      <div className="mt-8 text-center">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.4em]">SISTEMA DE GESTÃO PATRIMONIAL</p>
        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-2">© 2026 AUDIT AUTHORITY - TODOS OS DIREITOS RESERVADOS</p>
      </div>
    </div>
  );
};

export default PublicKardex;
