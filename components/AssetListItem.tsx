
import React, { useMemo, memo } from 'react';
import { Asset, TagInventario } from '../types';
import { determineAssetTag, getTagMetadata } from '../services/tagService';
import { formatEtiqueta } from '../utils/formatUtils';
import { 
  Camera, 
  Check, 
  MapPin,
  Eye
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
  hasLocalPhoto,
  onViewPhoto
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
    if (onMakeDecision) {
      if (navigator.vibrate) navigator.vibrate(10);
      onMakeDecision(String(asset.id), 'YES');
    }
  };

  const isAdopted = visualStatus === TagInventario.ADOTADO || visualStatus === TagInventario.RE_ADOTADO;
  
  // Real evidence: use local path if available
  const photoUrl = asset._photoUrl || asset.FOTO_PATH;

  return (
    <div 
      className={`mb-2 bg-white rounded-xl border border-slate-100 relative transition-all active:scale-[0.98] shadow-sm overflow-hidden flex ${isSelected ? 'ring-2 ring-blue-500' : ''}`} 
      onClick={() => {
        if (isBatchMode && onToggleSelect) {
          if (!isConferido) onToggleSelect(String(asset.id));
        } else if (onSelect) {
          onSelect(asset);
        }
      }}
    >
      {/* Indicador Lateral Técnico (4px) */}
      <div 
        className={`w-1 shrink-0 h-full absolute left-0 top-0 bottom-0 ${
          visualStatus === TagInventario.PENDENTE ? 'bg-slate-400' : 
          visualStatus === TagInventario.CONFERIDO ? 'bg-emerald-500' : 
          visualStatus === TagInventario.ADOTADO ? 'bg-blue-500' : 
          visualStatus === TagInventario.RE_ADOTADO ? 'bg-fuchsia-500' : 
          visualStatus === TagInventario.NOVO_ITEM ? 'bg-violet-500' : 
          'bg-orange-500'
        }`}
      />

      <div className="flex-1 p-4 pl-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center space-x-1.5 mb-1">
              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                #{asset.REGISTRO || String(asset.id).slice(-6).toUpperCase()}
              </span>
              {(photoUrl || hasLocalPhoto) && (
                <Camera size={10} className="text-blue-500" />
              )}
              {isBaixado && (
                <span className="px-1.5 py-0.5 bg-red-50 text-red-500 text-[7px] font-black rounded uppercase tracking-tighter">BAIXA</span>
              )}
            </div>

            <h3 className="text-sm font-black text-slate-900 leading-tight line-clamp-1 truncate uppercase">
              {asset.DESCRICAODOATIVO || asset.DESCRICAODOBEM || asset.DESCRICAO || 'DESCRIÇÃO NÃO CADASTRADA'}
            </h3>
            
            <p className="text-lg font-black text-slate-700 font-mono tracking-tighter mb-2">
              {formatEtiqueta(asset.ETIQUETA)}
            </p>

            <div className="flex items-center space-x-2">
              <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded ${meta.color.bg} border ${meta.color.border}`}>
                <StatusIcon size={8} className={meta.color.text} />
                <span className={`text-[8px] font-black uppercase tracking-tight ${meta.color.text}`}>
                  {visualStatus}
                </span>
              </div>
              {asset.SERIAL && (
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">S/N: {asset.SERIAL}</span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end space-y-2">
            <div className="flex items-center space-x-2">
              {isBatchMode ? (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white'}`}>
                  {isSelected && <Check size={18} strokeWidth={4} />}
                </div>
              ) : (
                <button 
                  onClick={!isConferido ? handleConfirm : undefined}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isConferido ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'border border-slate-200 bg-white active:scale-90 shadow-sm'} ${isConferido ? 'text-white' : 'text-slate-200'}`}
                >
                  <Check size={20} strokeWidth={4} />
                </button>
              )}
            </div>
            
            {/* Native Evidence Thumbnail */}
            {photoUrl && isConferido && (
              <div 
                className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative group cursor-pointer active:scale-95 transition-transform"
                onClick={(e) => { e.stopPropagation(); onViewPhoto?.(photoUrl); }}
              >
                <img 
                  src={photoUrl} 
                  alt="Evidência" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40/f1f5f9/64748b?text=?'; }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Eye size={12} className="text-white" />
                </div>
              </div>
            )}
          </div>
        </div>

        {isAdopted && (
          <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center space-x-3">
             <div className="flex flex-col items-center">
                <MapPin size={10} className="text-slate-400" />
                <div className="h-2 w-[1px] bg-slate-300 my-0.5" />
                <MapPin size={10} className="text-blue-500" />
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight truncate">De: {asset.ENDERECO || 'BASE'}</p>
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-tight truncate">Para: {asset._localMaster || selectedLocation}</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const AssetListItem = memo(AssetListItemComponent);
