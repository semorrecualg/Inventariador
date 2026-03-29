
import { TagInventario, Asset } from '../types';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  PlusCircle, 
  AlertTriangle, 
  ExternalLink,
  Tag,
  Check,
  RefreshCw
} from 'lucide-react';

export interface TagMetadata {
  id: TagInventario;
  label: string;
  description: string;
  color: {
    bg: string;
    text: string;
    border: string;
    badge: string;
    button: string;
    icon: string;
  };
  icon: React.ElementType;
  priority: number;
}

export const TAG_POLICY: Record<TagInventario, TagMetadata> = {
  [TagInventario.BAIXADO]: {
    id: TagInventario.BAIXADO,
    label: 'BAIXADO',
    description: 'Ativo com status de baixa ou data de baixa preenchida. Status permanente e imutável.',
    color: {
      bg: 'bg-red-950/30',
      text: 'text-red-400',
      border: 'border-red-500/30',
      badge: 'bg-red-500/20 text-red-400 border-red-500/30',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      icon: 'text-red-500'
    },
    icon: AlertCircle,
    priority: 1
  },
  [TagInventario.DIVERGENCIA]: {
    id: TagInventario.DIVERGENCIA,
    label: 'DIVERGÊNCIA',
    description: 'Etiqueta física encontrada difere do registro mestre no sistema.',
    color: {
      bg: 'bg-orange-950/30',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
      icon: 'text-orange-500'
    },
    icon: AlertTriangle,
    priority: 2
  },
  [TagInventario.ADOTADO_EXTERNO]: {
    id: TagInventario.ADOTADO_EXTERNO,
    label: 'ADOTADO EXTERNO',
    description: 'Ativo pertencente a outra empresa encontrado nesta auditoria.',
    color: {
      bg: 'bg-amber-950/30',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      icon: 'text-amber-500'
    },
    icon: ExternalLink,
    priority: 3
  },
  [TagInventario.NOVO_ITEM]: {
    id: TagInventario.NOVO_ITEM,
    label: 'NOVO ITEM',
    description: 'Ativo não encontrado na base mestre, cadastrado durante o inventário.',
    color: {
      bg: 'bg-purple-950/30',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      button: 'bg-purple-600 hover:bg-purple-700 text-white',
      icon: 'text-purple-500'
    },
    icon: PlusCircle,
    priority: 4
  },
  [TagInventario.RE_ADOTADO]: {
    id: TagInventario.RE_ADOTADO,
    label: 'RE-ADOTADO',
    description: 'Ativo já conferido anteriormente em um local e agora encontrado em outro local.',
    color: {
      bg: 'bg-fuchsia-950/30',
      text: 'text-fuchsia-400',
      border: 'border-fuchsia-500/30',
      badge: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
      button: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
      icon: 'text-fuchsia-500'
    },
    icon: RefreshCw,
    priority: 5.5
  },
  [TagInventario.ADOTADO]: {
    id: TagInventario.ADOTADO,
    label: 'ADOTADO',
    description: 'Ativo encontrado em endereço diferente do registro original.',
    color: {
      bg: 'bg-blue-950/30',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      badge: 'bg-blue-600 text-white font-black',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      icon: 'text-blue-500'
    },
    icon: MapPin,
    priority: 5
  },
  [TagInventario.CONFERIDO]: {
    id: TagInventario.CONFERIDO,
    label: 'CONFERIDO',
    description: 'Ativo encontrado exatamente no endereço original da base mestre.',
    color: {
      bg: 'bg-emerald-950/30',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      icon: 'text-emerald-500'
    },
    icon: CheckCircle2,
    priority: 6
  },
  [TagInventario.PENDENTE]: {
    id: TagInventario.PENDENTE,
    label: 'PENDENTE',
    description: 'Ativo disponível para ser inventariado na base campo STATUS igual a [ATIVO].',
    color: {
      bg: 'bg-slate-900',
      text: 'text-slate-400',
      border: 'border-slate-800',
      badge: 'bg-slate-800 text-slate-400 border-slate-700',
      button: 'bg-slate-700 hover:bg-slate-600 text-white',
      icon: 'text-slate-500'
    },
    icon: Clock,
    priority: 7
  },
  [TagInventario.FALTA_ETIQUETAR]: {
    id: TagInventario.FALTA_ETIQUETAR,
    label: 'FALTA ETIQUETAR',
    description: 'Ativo marcado para receber nova etiqueta física.',
    color: {
      bg: 'bg-rose-950/30',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
      icon: 'text-rose-500'
    },
    icon: Tag,
    priority: 8
  },
  [TagInventario.ETIQUETADO]: {
    id: TagInventario.ETIQUETADO,
    label: 'ETIQUETADO',
    description: 'Ativo que já recebeu a nova etiqueta física.',
    color: {
      bg: 'bg-cyan-950/30',
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      button: 'bg-cyan-600 hover:bg-cyan-700 text-white',
      icon: 'text-cyan-500'
    },
    icon: Check,
    priority: 9
  }
};

export const normalizeString = (s: string): string => {
  return s.toString().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

export const determineAssetTag = (asset: Asset, targetLocation: string, selectedUnit: string | null): TagInventario => {
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
  
  // 1. BAIXADO (Prioridade Máxima)
  if (isBaixado) return TagInventario.BAIXADO;
  
  // 2. ADOTADO EXTERNO
  if (selectedUnit) {
    const assetCompKey = normalizeString(asset.UNIDADE_OPERACIONAL || asset._unitid || '');
    const currentCompKey = normalizeString(selectedUnit);
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }
  }

  // 3. ETIQUETAGEM (Workflow específico)
  const needsLabel = normalizeString(asset.ETIQUETA || '') === 'ETIQUETAR';
  if (needsLabel) {
    return asset._conferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
  }
  
  // 4. NOVO ITEM
  if (asset._isNew) return TagInventario.NOVO_ITEM;

  // 5. DIVERGÊNCIA
  const currentEtq = normalizeString(asset.ETIQUETA || "");
  const masterEtq = normalizeString(asset._plaquetaMaster || "");
  if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
    return TagInventario.DIVERGENCIA;
  }

  // Se não foi conferido ainda, é PENDENTE
  if (!asset._conferido) return TagInventario.PENDENTE;

  // 6. CONFERIDO vs ADOTADO
  const targetLocKey = normalizeString(targetLocation);
  const originalLocKey = normalizeString(asset.ENDERECO || ""); 
  
  if (originalLocKey === targetLocKey) {
    return TagInventario.CONFERIDO;
  }

  return TagInventario.ADOTADO;
};

export const getTagMetadata = (tag: TagInventario | undefined): TagMetadata => {
  return TAG_POLICY[tag || TagInventario.PENDENTE] || TAG_POLICY[TagInventario.PENDENTE];
};
