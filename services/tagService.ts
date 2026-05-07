
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
      bg: 'bg-orange-50',
      text: 'text-orange-500',
      border: 'border-orange-200',
      badge: 'bg-orange-500 text-white font-black',
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
      bg: 'bg-violet-50',
      text: 'text-violet-500',
      border: 'border-violet-200',
      badge: 'bg-violet-500 text-white font-black',
      button: 'bg-violet-600 hover:bg-violet-700 text-white',
      icon: 'text-violet-500'
    },
    icon: PlusCircle,
    priority: 4
  },
  [TagInventario.RE_ADOTADO]: {
    id: TagInventario.RE_ADOTADO,
    label: 'RE-ADOTADO',
    description: 'Ativo já conferido anteriormente em um local e agora encontrado em outro local.',
    color: {
      bg: 'bg-fuchsia-50',
      text: 'text-fuchsia-500',
      border: 'border-fuchsia-200',
      badge: 'bg-fuchsia-500 text-white font-black',
      button: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
      icon: 'text-fuchsia-500'
    },
    icon: RefreshCw,
    priority: 5.5
  },
  [TagInventario.ADOTADO]: {
    id: TagInventario.ADOTADO,
    label: 'TRANSFERIDO',
    description: 'Item localizado em endereço diferente do original (gera relatório De/Para).',
    color: {
      bg: 'bg-blue-50',
      text: 'text-[#1E40AF]',
      border: 'border-blue-200',
      badge: 'bg-[#1E40AF] text-white font-black',
      button: 'bg-[#1E40AF] hover:bg-blue-800 text-white',
      icon: 'text-blue-600'
    },
    icon: MapPin,
    priority: 5
  },
  [TagInventario.CONFERIDO]: {
    id: TagInventario.CONFERIDO,
    label: 'CONFERIDO',
    description: 'Ativo encontrado exatamente no endereço original da base mestre.',
    color: {
      bg: 'bg-emerald-50',
      text: 'text-[#10B981]',
      border: 'border-emerald-200',
      badge: 'bg-[#10B981] text-white font-black',
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
      bg: 'bg-amber-50',
      text: 'text-[#000000]', // Preto puro para legibilidade máxima
      border: 'border-amber-200',
      badge: 'bg-[#F59E0B] text-[#000000] font-black',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      icon: 'text-amber-500'
    },
    icon: Clock,
    priority: 7
  },
  [TagInventario.FALTA_ETIQUETAR]: {
    id: TagInventario.FALTA_ETIQUETAR,
    label: 'FALTA ETIQUETAR',
    description: 'Ativo marcado para receber nova etiqueta física.',
    color: {
      bg: 'bg-rose-50',
      text: 'text-rose-500',
      border: 'border-rose-200',
      badge: 'bg-rose-500 text-white font-black',
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
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
  
  // REGRA DE OURO: Divergência Crítica (Ativo mas com Baixa)
  const isGoldenRuleDivergent = !statusUpper.includes('BAIXA') && !!asset.DATABAIXA;
  if (isGoldenRuleDivergent) return TagInventario.DIVERGENCIA;

  // 1. ETIQUETAGEM (Workflow Soberano v24)
  const masterEtq = normalizeString(asset._plaquetaMaster || '');
  if (masterEtq === 'ETIQUETAR') {
    return isConferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
  }
  
  // 2. BAIXADO (Se não conferido)
  if (isBaixado && !isConferido) return TagInventario.BAIXADO;
  
  // 3. ADOTADO EXTERNO (Empresa/Unidade diferente)
  if (selectedUnit) {
    const assetCompKey = normalizeString(asset.UNIDADE_OPERACIONAL || asset._unitid || asset.GRUPO_EMPRESARIAL || '');
    const currentCompKey = normalizeString(selectedUnit);
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }
  }
  
  // 4. NOVO ITEM
  if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;

  // 5. DIVERGÊNCIA (Plaqueta física != lógíca)
  const currentEtq = normalizeString(asset.ETIQUETA || "");
  if (masterEtq !== "" && currentEtq !== masterEtq) {
    return TagInventario.DIVERGENCIA;
  }

  // Se não foi conferido ainda, é PENDENTE
  if (!isConferido) return TagInventario.PENDENTE;

  // 6. CONFERIDO vs ADOTADO vs RE-ADOTADO
  const targetLocKey = normalizeString(targetLocation);
  const originalLocKey = normalizeString(asset.ENDERECO || ""); 
  const currentAuditLocKey = asset._localMaster ? normalizeString(asset._localMaster) : "";
  
  // 3) RE-ADOTADO: Já conferido anteriormente em um local e agora encontrado em outro local
  if (isConferido && currentAuditLocKey !== "" && currentAuditLocKey !== targetLocKey) {
    return TagInventario.RE_ADOTADO;
  }

  if (originalLocKey === targetLocKey) {
    return TagInventario.CONFERIDO;
  }

  return TagInventario.ADOTADO;
};

export const getTagMetadata = (tag: TagInventario | undefined): TagMetadata => {
  return TAG_POLICY[tag || TagInventario.PENDENTE] || TAG_POLICY[TagInventario.PENDENTE];
};
