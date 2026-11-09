
import React, { useMemo } from 'react';
import { Asset, TagInventario } from '../types';
import { resolvePersistedTag, getTagMetadata } from '../services/tagService';
import { formatMonthYearBR, formatEtiqueta } from '../utils/formatUtils';
import { 
  Camera, 
  Check, 
  QrCode,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  ArrowDown,
  MapPin
} from 'lucide-react';

interface AssetListItemProps {
  asset: Asset;
  selectedLocation?: string | null;
  selectedUnit?: string | null;
  isSelected?: boolean;
  isBatchMode?: boolean;
  onSelect?: (asset: Asset) => void;
  onToggleSelect?: (id: string) => void;
  onMakeDecision?: (id: string, decision: 'YES' | 'NO') => void;
  hasLocalPhoto?: boolean;
  extraAction?: React.ReactNode;
  onShowQr?: (asset: Asset) => void;
}

const formatReadingTime = (isoStr?: string) => {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const AssetListItem: React.FC<AssetListItemProps> = ({ 
  asset, 
  selectedLocation, 
  selectedUnit,
  isSelected, 
  isBatchMode, 
  onSelect, 
  onToggleSelect, 
  onMakeDecision,
  hasLocalPhoto,
  extraAction,
  onShowQr
}) => {
  const statusUpper = String(asset.status || '').toUpperCase();
  
  const isBaixado = useMemo(() => {
    return statusUpper.includes('BAIXA') || !!asset.databaixa;
  }, [statusUpper, asset.databaixa]);

  const visualStatus = useMemo(() => {
    return resolvePersistedTag(
      asset, 
      selectedLocation || asset._localMaster || asset.endereco || "", 
      selectedUnit || asset._unitid || null
    );
  }, [asset, selectedLocation, selectedUnit]);

  const meta = getTagMetadata(visualStatus);
  const StatusIcon = meta.icon;
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

  const fullDescription = [
    asset.qt || '1',
    asset.descricaodoativo || 'SEM DESCRIÇÃO',
    asset.serial ? `S/N: ${asset.serial}` : 'S/N',
    asset.dataaqusic ? formatMonthYearBR(asset.dataaqusic) : '',
  ].filter(Boolean).join('; ');

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMakeDecision) {
      if (navigator.vibrate) navigator.vibrate(10);
      onMakeDecision(String(asset.id), 'YES');
    }
  };

  const isAdopted = visualStatus === TagInventario.ADOTADO || visualStatus === TagInventario.RE_ADOTADO;
  const isAdotadoExterno = visualStatus === TagInventario.ADOTADO_EXTERNO;

  return (
    <div 
      className={`mb-3 p-4 pl-5 bg-white rounded-2xl border border-[#F1F5F9] relative overflow-hidden transition-all active:scale-[0.99] shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${isAdotadoExterno ? 'ring-2 ring-amber-400 shadow-lg' : ''} ${isSelected ? 'ring-2 ring-accent' : ''}`} 
      onClick={() => {
        if (isBatchMode && onToggleSelect) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else if (onSelect) {
          onSelect(asset);
        }
      }}
    >
      {/* Faixa lateral permanente com a cor da TAG de auditoria */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${meta.color.bg}`} />

      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <div className="bg-[#F1F5F9] px-1.5 py-0.5 rounded-[4px]">
              <span className="text-[9px] font-extrabold text-[#64748B] uppercase tracking-wider">PATRIMÔNIO</span>
            </div>
            {(asset._photoUrl || hasLocalPhoto) && (
              <Camera size={12} className="text-accent" />
            )}
            {/* TAG DE AUDITORIA — Regra de Ouro da conferência física */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm ${meta.color.badge}`}>
              <StatusIcon size={12} />
              <span className={`text-[10px] font-black uppercase tracking-wide ${meta.color.text}`}>
                {meta.label}
              </span>
            </div>
          </div>

          {isBaixado && (
            <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle size={12} className="text-red-600 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wide text-red-700 leading-tight">
                Baixado na base mestre — status permanente
              </span>
            </div>
          )}

          {isAdotadoExterno && (
            <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-amber-400">
              <ExternalLink size={12} className="text-amber-300 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wide text-amber-300 leading-tight">
                Adotado externo — registro de outra empresa
              </span>
            </div>
          )}
          
          <h3 className="text-xl font-extrabold text-[#1E293B] font-mono tracking-tight mb-1 truncate">
            {formatEtiqueta(asset.etiqueta)}
          </h3>
          
          <p className="text-sm font-medium text-[#475569] leading-snug line-clamp-2 mb-2">
            {fullDescription}
          </p>
          
          {isAdopted && (
            <div className="mb-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3 space-y-2 animate-fadeIn shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-100 pb-1.5 mb-1.5">
                <span className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em]">Situação: Adoção</span>
                <MapPin size={10} className="text-blue-500" />
              </div>
              
              <div className="flex items-start">
                <div className="w-5 h-5 rounded-lg bg-slate-200 flex items-center justify-center mr-2 shrink-0">
                  <MapPin size={10} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-0.5">Origem (Base)</p>
                  <p className="text-[10px] font-black text-slate-700 uppercase leading-tight truncate">
                    {asset.endereco || 'NÃO INFORMADO'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center -my-1 h-3">
                <ArrowDown size={10} className="text-blue-400 animate-bounce" />
              </div>

              <div className="flex items-start">
                <div className="w-5 h-5 rounded-lg bg-blue-500 flex items-center justify-center mr-2 shrink-0 shadow-lg shadow-blue-500/20">
                  <MapPin size={10} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[7px] font-bold text-blue-500 uppercase tracking-widest leading-none mb-0.5">Encontrado (Inventário)</p>
                  <p className="text-[10px] font-black text-blue-700 uppercase leading-tight truncate">
                    {asset._localMaster || selectedLocation || 'LOCAL ATUAL'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
            {Number(asset._is_synced) === 1 ? (
              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight bg-emerald-50/60 border border-emerald-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                Sincronizado
              </span>
            ) : (
              <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tight bg-amber-50/60 border border-amber-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                <span className="w-1 h-1 bg-amber-400 rounded-full animate-ping"></span>
                Pendente Nuvem
              </span>
            )}
            {asset.registro && (
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-tight">
                REG: {asset.registro}
              </span>
            )}
            {asset._dataLeitura && !isAdopted && (
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-tight">
                {formatReadingTime(asset._dataLeitura)}
              </span>
            )}
            {asset._is_divergent_baixa && (
              <div className="flex items-center space-x-1 text-red-600 animate-pulse">
                <AlertTriangle size={12} />
                <span className="text-[9px] font-black uppercase">Divergência Crítica</span>
              </div>
            )}
          </div>
        </div>

        {/* Ações do ativo — QR no topo e CONFIRMAÇÃO em destaque à direita */}
        <div className="shrink-0 ml-3 flex flex-col items-center justify-between gap-2 self-stretch py-0.5">
          {onShowQr && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowQr(asset); }}
              aria-label={`Ver QR Code do ativo ${formatEtiqueta(asset.etiqueta)}`}
              className="w-9 h-9 flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 rounded-xl shadow-sm active:scale-90 hover:text-blue-600 hover:border-blue-200 transition-colors"
              id={`qr-btn-${asset.id}`}
            >
              <QrCode size={15} />
            </button>
          )}
          {extraAction}
          {isBatchMode ? (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-accent text-white ring-4 ring-accent/20' : 'border-2 border-[#CBD5E1] bg-white'}`}>
              {isSelected && <Check size={24} strokeWidth={4} />}
            </div>
          ) : onMakeDecision ? (
            isConferido ? (
              <div
                aria-label={`${meta.label} — ativo já processado`}
                title={meta.label}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ring-1 ring-inset ring-slate-900/5 ${meta.color.softBg} ${meta.color.icon}`}
              >
                <Check size={26} strokeWidth={4} />
              </div>
            ) : (
              <button
                onClick={handleConfirm}
                aria-label={`Confirmar ativo ${formatEtiqueta(asset.etiqueta)} no inventário`}
                title="Confirmar este ativo no inventário"
                className="group flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <span className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-md shadow-blue-200/60 ring-4 ring-blue-100/70 group-hover:bg-blue-200/80 group-hover:ring-blue-200/70 transition-all">
                  <Check size={30} strokeWidth={3.5} />
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest text-blue-500 leading-none">
                  Confirmar
                </span>
              </button>
            )
          ) : isConferido ? (
            <div
              aria-label={`${meta.label} — ativo já processado`}
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ring-1 ring-inset ring-slate-900/5 ${meta.color.softBg} ${meta.color.icon}`}
            >
              <Check size={20} strokeWidth={4} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
