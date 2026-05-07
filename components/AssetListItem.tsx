
import React, { useMemo, memo } from 'react';
import { Asset, TagInventario } from '../types';
import { determineAssetTag, getTagMetadata } from '../services/tagService';
import { formatEtiqueta } from '../utils/formatUtils';
import { 
  Camera, 
  Check, 
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
  onViewPhoto?: (url: string) => void;
}

const AssetListItemComponent: React.FC<AssetListItemProps> = ({ 
  asset, 
  selectedLocation, 
  selectedUnit,
  isSelected, 
  isBatchMode, 
  onSelect, 
  onToggleSelect, 
  onMakeDecision,
  hasLocalPhoto
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

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMakeDecision && !isConferido) {
      if (navigator.vibrate) navigator.vibrate(20);
      onMakeDecision(String(asset.id), 'YES');
    }
  };

  const isAdopted = visualStatus === TagInventario.ADOTADO || visualStatus === TagInventario.RE_ADOTADO;
  const photoUrl = asset._photoUrl || asset.FOTO_PATH;

  return (
    <div 
      className={`mb-3 p-3 border-l-4 rounded-xl relative overflow-hidden transition-all modern-card shadow-sm bg-white border border-slate-100 ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isConferido ? 'bg-slate-50' : 'active:scale-[0.99] cursor-pointer'}`} 
      style={{ borderLeftColor: meta.color.hex || '#e2e8f0' }}
      onClick={() => {
        if (isBatchMode && onToggleSelect) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else if (onSelect) {
          onSelect(asset);
        }
      }}
    >
      {/* Small Status Badge Top Left */}
      <div className={`absolute top-0 left-0 px-2 py-0.5 rounded-br-lg text-[7px] font-black uppercase flex items-center space-x-1 shadow-sm z-10 ${meta.color.badge || 'bg-slate-200 text-slate-600'}`}>
        <StatusIcon size={9} strokeWidth={3} />
        <span className="tracking-widest">
          {asset.REGISTRO || '---'} | {visualStatus}
        </span>
      </div>
      
      <div className="pt-4 pr-10 flex flex-col space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
            <span className={`text-lg font-black font-mono tracking-tighter ${isConferido ? 'text-emerald-600' : 'text-slate-900'}`}>
              {formatEtiqueta(asset.ETIQUETA)}
            </span>
          </div>
          {(photoUrl || hasLocalPhoto) && !isConferido && (
            <Camera size={12} className="text-blue-500" />
          )}
        </div>

        {/* Full description - No truncation */}
        <p className="text-[11px] font-bold text-slate-600 uppercase leading-snug tracking-tight whitespace-normal break-words">
          {[
            asset.DESCRICAODOATIVO || asset.DESCRICAODOBEM || 'DESCRIÇÃO NÃO CADASTRADA',
            asset.SERIAL ? `SN: ${asset.SERIAL}` : null
          ].filter(Boolean).join(' | ')}
        </p>

        <div className="flex items-center space-x-2 pt-1 border-t border-slate-100 mt-1">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">C. Custo:</span>
          <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight truncate">
            {asset.CENTRODECUSTO || '---'}
          </span>
        </div>

        {isBaixado && (
          <div className="flex items-center space-x-1 mt-1">
             <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[8px] font-black rounded uppercase tracking-widest border border-red-100">
               BAIXADO
             </span>
          </div>
        )}

        {isAdopted && (
          <div className="mt-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center space-x-3">
             <div className="flex flex-col items-center">
                <MapPin size={8} className="text-slate-400" />
                <div className="h-2 w-[1px] bg-slate-300 my-0.5" />
                <MapPin size={8} className="text-blue-500" />
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tight truncate">De: {asset.ENDERECO || 'BASE'}</p>
                <p className="text-[8px] font-black text-slate-700 uppercase tracking-tight truncate">Para: {asset._localMaster || selectedLocation}</p>
             </div>
          </div>
        )}
      </div>

      {/* Confirmation Button Bottom Right */}
      <div className="absolute bottom-3 right-3">
        {isBatchMode ? (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md ${isSelected ? 'bg-blue-600 text-white' : 'border-2 border-slate-200 bg-white'}`}>
            {isSelected && <Check size={20} strokeWidth={4} />}
          </div>
        ) : (
          <button 
            onClick={handleConfirm}
            disabled={isConferido}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${isConferido ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200 text-slate-400 active:scale-95 active:bg-slate-50'}`}
          >
            {isConferido ? (
              <Check size={20} strokeWidth={4} />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export const AssetListItem = memo(AssetListItemComponent);
