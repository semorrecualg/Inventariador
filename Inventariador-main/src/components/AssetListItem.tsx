
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
      className={`mb-2.5 p-3.5 pl-4 bg-white rounded-2xl border border-[#F1F5F9] relative overflow-hidden transition-all active:scale-[0.99] shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${isAdotadoExterno ? 'ring-2 ring-amber-400 shadow-lg' : ''} ${isSelected ? 'ring-2 ring-accent' : ''}`} 
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

      <div>
        <div className="min-w-0">
          {/* Topo: badge/TAG à esquerda, ações rápidas (QR) à direita */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center flex-wrap gap-2 min-w-0">
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

            <div className="flex items-center gap-2 shrink-0">
              {onShowQr && (
                <button
                  onClick={(e) => { e.stopPropagation(); onShowQr(asset); }}
                  aria-label={`Ver QR Code do ativo ${formatEtiqueta(asset.etiqueta)}`}
                  className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 rounded-lg shadow-sm active:scale-90 hover:text-blue-600 hover:border-blue-200 transition-colors"
                  id={`qr-btn-${asset.id}`}
                >
                  <QrCode size={14} />
                </button>
              )}
              {extraAction}
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

          {/* Texto a toda a largura: sem coluna lateral a espremer o conteúdo */}
          <p className="text-sm font-medium text-[#475569] leading-snug line-clamp-2 mb-1.5">
            {fullDescription}
          </p>
          
          {isAdopted && (
            <div className="mb-2 bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 space-y-2 animate-fadeIn shadow-sm">
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

        {/* Confirmação em barra na base do card: liberta a largura do texto e
            baixa a altura (antes era um botão redondo na coluna da direita). */}
        {isBatchMode ? (
          <div
            aria-label={isSelected ? 'Ativo selecionado' : isConferido ? 'Ativo já conferido' : 'Ativo não selecionado'}
            className={`mt-2.5 w-full h-10 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest ${isSelected
              ? 'bg-accent text-white shadow-accent/20'
              : isConferido
                ? 'bg-slate-100 text-slate-400 border border-slate-200'
                : 'border border-[#CBD5E1] bg-white text-slate-500'
            }`}
          >
            {isSelected && <Check size={16} strokeWidth={4} />}
            {isSelected ? 'Selecionado' : isConferido ? 'Já conferido' : 'Selecionar'}
          </div>
        ) : onMakeDecision ? (
          isConferido ? (
            <div
              aria-label={`${meta.label} — ativo já processado`}
              title={meta.label}
              className={`mt-2.5 w-full h-9 rounded-xl flex items-center justify-center gap-2 shadow-sm ring-1 ring-inset ring-slate-900/5 ${meta.color.softBg} ${meta.color.icon}`}
            >
              <Check size={15} strokeWidth={4} />
              <span className="text-[10px] font-black uppercase tracking-widest">{meta.label}</span>
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              aria-label={`Confirmar ativo ${formatEtiqueta(asset.etiqueta)} no inventário`}
              title="Confirmar este ativo no inventário"
              className="mt-2.5 w-full h-11 rounded-xl bg-accent text-white flex items-center justify-center gap-2 shadow-md shadow-accent/25 active:scale-[0.98] hover:bg-accent/90 transition-all"
            >
              <Check size={16} strokeWidth={3.5} />
              <span className="text-[11px] font-black uppercase tracking-widest leading-none">Confirmar</span>
            </button>
          )
        ) : isConferido ? (
          <div
            aria-label={`${meta.label} — ativo já processado`}
            className={`mt-2.5 w-full h-9 rounded-xl flex items-center justify-center gap-2 shadow-sm ring-1 ring-inset ring-slate-900/5 ${meta.color.softBg} ${meta.color.icon}`}
          >
            <Check size={15} strokeWidth={4} />
            <span className="text-[10px] font-black uppercase tracking-widest">{meta.label}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
