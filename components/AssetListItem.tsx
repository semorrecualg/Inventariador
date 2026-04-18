
import React, { useMemo } from 'react';
import { Asset, TagInventario } from '../types';
import { determineAssetTag, getTagMetadata } from '../services/tagService';
import { formatMonthYearBR, formatEtiqueta } from '../utils/formatUtils';
import { 
  Camera, 
  Check, 
  QrCode,
  AlertTriangle 
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
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  
  const isBaixado = useMemo(() => {
    return statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
  }, [statusUpper, asset.DATABAIXA]);

  const visualStatus = useMemo(() => {
    return determineAssetTag(
      asset, 
      selectedLocation || asset._localMaster || asset.ENDERECO || "", 
      selectedUnit || asset._unitid || null
    );
  }, [asset, selectedLocation, selectedUnit]);

  const meta = getTagMetadata(visualStatus);
  const StatusIcon = meta.icon;
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL ? `S/N: ${asset.SERIAL}` : 'S/N',
    asset.DATAAQUISIC ? formatMonthYearBR(asset.DATAAQUISIC) : '',
  ].filter(Boolean).join('; ');

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMakeDecision) {
      if (navigator.vibrate) navigator.vibrate(10);
      onMakeDecision(String(asset.id), 'YES');
    }
  };

  const isAdopted = visualStatus === TagInventario.ADOTADO || visualStatus === TagInventario.RE_ADOTADO;

  return (
    <div 
      className={`mb-3 p-4 bg-white rounded-2xl border border-[#F1F5F9] relative transition-all active:scale-[0.99] shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${isSelected ? 'ring-2 ring-accent' : ''}`} 
      onClick={() => {
        if (isBatchMode && onToggleSelect) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else if (onSelect) {
          onSelect(asset);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <div className="bg-[#F1F5F9] px-1.5 py-0.5 rounded-[4px]">
              <span className="text-[9px] font-extrabold text-[#64748B] uppercase tracking-wider">PATRIMÔNIO</span>
            </div>
            {(asset._photoUrl || hasLocalPhoto) && (
              <Camera size={12} className="text-accent" />
            )}
            {isBaixado && (
              <div className="bg-red-50 px-1.5 py-0.5 rounded-[4px]">
                <span className="text-[9px] font-extrabold text-red-600 uppercase tracking-wider">BAIXA</span>
              </div>
            )}
          </div>
          
          <h3 className="text-xl font-extrabold text-[#1E293B] font-mono tracking-tight mb-1 truncate">
            {formatEtiqueta(asset.ETIQUETA)}
          </h3>
          
          <p className="text-sm font-medium text-[#475569] leading-snug line-clamp-2 mb-2">
            {fullDescription}
          </p>
          
          {isAdopted && (
            <div className="mb-2 bg-blue-50/50 border border-blue-100/50 rounded-lg p-2 space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">ORIGEM: {asset.ENDERECO || 'N/I'}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[8px] font-bold text-blue-600 uppercase tracking-widest">ENCONTRADO: {asset._localMaster || selectedLocation || 'ATUAL'}</span>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-md ${meta.color.bg} ${meta.color.border} border`}>
              <StatusIcon size={10} className={meta.color.text} />
              <span className={`text-[10px] font-black uppercase tracking-tight ${meta.color.text}`}>
                {visualStatus}
              </span>
            </div>
            {asset.REGISTRO && (
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-tight">
                REG: {asset.REGISTRO}
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

        {/* Ação Integrada */}
        <div className="shrink-0 ml-2 flex items-center space-x-2">
          {onShowQr && (
            <button 
              onClick={(e) => { e.stopPropagation(); onShowQr(asset); }} 
              className="p-3 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl active:scale-90 shadow-sm hover:text-blue-600 transition-colors mr-1"
              id={`qr-btn-${asset.id}`}
            >
              <QrCode size={16} />
            </button>
          )}
          {extraAction}
          {isBatchMode ? (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-accent text-white ring-4 ring-accent/20' : 'border-2 border-[#CBD5E1] bg-white'}`}>
              {isSelected && <Check size={22} strokeWidth={4} />}
            </div>
          ) : (
            <button 
              onClick={!isConferido ? handleConfirm : undefined}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md ${isConferido ? meta.color.bg.replace('/30', '') : 'border-2 border-[#CBD5E1] bg-white active:scale-95'} ${isConferido ? 'text-white' : ''}`}
            >
              {isConferido ? (
                <Check size={26} strokeWidth={4} />
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-[#CBD5E1]/50" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
