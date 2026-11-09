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

/**
 * Contrato de cores das TAGS DE AUDITORIA (tema claro).
 * Cada tag é um bloco sólido de alta legibilidade: `bg` + `text` + `border`.
 * As cores seguem as Regras de Ouro da conferência física:
 *   BAIXADO        → Vermelho crítico (permanente e imutável)
 *   DIVERGÊNCIA    → Laranja de alerta (regra de ouro / plaqueta)
 *   ADOTADO EXTERNO→ Preto com destaque âmbar (outra empresa)
 *   NOVO ITEM      → Âmbar/laranja
 *   ADOTADO        → Azul royal
 *   RE-ADOTADO     → Violeta/Fúcsia
 *   CONFERIDO      → Verde esmeralda
 *   PENDENTE       → Cinza aço (disponível para inventariar)
 */
export const TAG_POLICY: Record<TagInventario, TagMetadata> = {
  [TagInventario.BAIXADO]: {
    id: TagInventario.BAIXADO,
    label: 'BAIXADO',
    description: 'Ativo com status de baixa ou data de baixa preenchida. Status permanente e imutável.',
    color: {
      bg: 'bg-red-600',
      text: 'text-white',
      border: 'border-red-700',
      badge: 'bg-red-600 text-white border-red-700',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      icon: 'text-red-600'
    },
    icon: AlertCircle,
    priority: 1
  },
  [TagInventario.DIVERGENCIA]: {
    id: TagInventario.DIVERGENCIA,
    label: 'DIVERGÊNCIA',
    description: 'Etiqueta física encontrada difere do registro mestre no sistema.',
    color: {
      bg: 'bg-orange-600',
      text: 'text-white',
      border: 'border-orange-700',
      badge: 'bg-orange-600 text-white border-orange-700',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
      icon: 'text-orange-600'
    },
    icon: AlertTriangle,
    priority: 2
  },
  [TagInventario.ADOTADO_EXTERNO]: {
    id: TagInventario.ADOTADO_EXTERNO,
    label: 'ADOTADO EXTERNO',
    description: 'Ativo pertencente a outra empresa encontrado nesta auditoria.',
    color: {
      bg: 'bg-slate-950',
      text: 'text-amber-300',
      border: 'border-amber-400',
      badge: 'bg-slate-950 text-amber-300 border-amber-400',
      button: 'bg-slate-950 hover:bg-slate-800 text-amber-300',
      icon: 'text-amber-400'
    },
    icon: ExternalLink,
    priority: 3
  },
  [TagInventario.NOVO_ITEM]: {
    id: TagInventario.NOVO_ITEM,
    label: 'NOVO ITEM',
    description: 'Ativo não encontrado na base mestre, cadastrado durante o inventário.',
    color: {
      bg: 'bg-amber-500',
      text: 'text-amber-950',
      border: 'border-amber-600',
      badge: 'bg-amber-500 text-amber-950 border-amber-600',
      button: 'bg-amber-500 hover:bg-amber-400 text-amber-950',
      icon: 'text-amber-600'
    },
    icon: PlusCircle,
    priority: 4
  },
  [TagInventario.ADOTADO]: {
    id: TagInventario.ADOTADO,
    label: 'ADOTADO',
    description: 'Ativo encontrado em endereço diferente do registro original.',
    color: {
      bg: 'bg-blue-600',
      text: 'text-white',
      border: 'border-blue-700',
      badge: 'bg-blue-600 text-white border-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      icon: 'text-blue-600'
    },
    icon: MapPin,
    priority: 5
  },
  [TagInventario.RE_ADOTADO]: {
    id: TagInventario.RE_ADOTADO,
    label: 'RE-ADOTADO',
    description: 'Ativo já conferido anteriormente em um local e agora encontrado em outro local.',
    color: {
      bg: 'bg-fuchsia-600',
      text: 'text-white',
      border: 'border-fuchsia-700',
      badge: 'bg-fuchsia-600 text-white border-fuchsia-700',
      button: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
      icon: 'text-fuchsia-600'
    },
    icon: RefreshCw,
    priority: 5.5
  },
  [TagInventario.CONFERIDO]: {
    id: TagInventario.CONFERIDO,
    label: 'CONFERIDO',
    description: 'Ativo encontrado exatamente no endereço original da base mestre.',
    color: {
      bg: 'bg-emerald-600',
      text: 'text-white',
      border: 'border-emerald-700',
      badge: 'bg-emerald-600 text-white border-emerald-700',
      button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      icon: 'text-emerald-600'
    },
    icon: CheckCircle2,
    priority: 6
  },
  [TagInventario.PENDENTE]: {
    id: TagInventario.PENDENTE,
    label: 'PENDENTE',
    description: 'Ativo disponível para ser inventariado (STATUS = ATIVO) no endereço original da base mestre.',
    color: {
      bg: 'bg-slate-600',
      text: 'text-white',
      border: 'border-slate-700',
      badge: 'bg-slate-600 text-white border-slate-700',
      button: 'bg-slate-700 hover:bg-slate-600 text-white',
      icon: 'text-slate-600'
    },
    icon: Clock,
    priority: 7
  },
  [TagInventario.FALTA_ETIQUETAR]: {
    id: TagInventario.FALTA_ETIQUETAR,
    label: 'FALTA ETIQUETAR',
    description: 'Ativo marcado para receber nova etiqueta física.',
    color: {
      bg: 'bg-rose-600',
      text: 'text-white',
      border: 'border-rose-700',
      badge: 'bg-rose-600 text-white border-rose-700',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
      icon: 'text-rose-600'
    },
    icon: Tag,
    priority: 8
  },
  [TagInventario.ETIQUETADO]: {
    id: TagInventario.ETIQUETADO,
    label: 'ETIQUETADO',
    description: 'Ativo que já recebeu a nova etiqueta física.',
    color: {
      bg: 'bg-cyan-600',
      text: 'text-white',
      border: 'border-cyan-700',
      badge: 'bg-cyan-600 text-white border-cyan-700',
      button: 'bg-cyan-600 hover:bg-cyan-700 text-white',
      icon: 'text-cyan-600'
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

export const isAssetBaixado = (asset: Asset): boolean => {
  const statusUpper = String(asset.status || '').toUpperCase();
  return statusUpper.includes('BAIXA') || !!asset.databaixa;
};

export const determineAssetTag = (asset: Asset, targetLocation: string, selectedUnit: string | null): TagInventario => {
  const statusUpper = String(asset.status || '').toUpperCase();
  const isBaixado = isAssetBaixado(asset);
  const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
  
  // REGRA DE OURO: Divergência Crítica (Ativo mas com Baixa)
  const isGoldenRuleDivergent = !statusUpper.includes('BAIXA') && !!asset.databaixa;
  if (isGoldenRuleDivergent) return TagInventario.DIVERGENCIA;

  // REGRA DE OURO: BAIXADO é permanente e imutável — permanece BAIXADO mesmo
  // que o item seja localizado fisicamente e conferido neste inventário.
  if (isBaixado) return TagInventario.BAIXADO;

  // 1. ETIQUETAGEM (Workflow Soberano v24)
  const masterEtq = normalizeString(asset._plaquetaMaster || '');
  if (masterEtq === 'ETIQUETAR') {
    return isConferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
  }

  // 2. ADOTADO EXTERNO (Empresa/Unidade diferente)
  if (selectedUnit) {
    const assetCompKey = normalizeString(asset.filial || asset._unitid || asset.GRUPO_EMPRESARIAL || '');
    const currentCompKey = normalizeString(selectedUnit);
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }
  }
  
  // 3. NOVO ITEM
  if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;

  // 4. DIVERGÊNCIA (Plaqueta física != lógica)
  const currentEtq = normalizeString(asset.etiqueta || "");
  if (masterEtq !== "" && currentEtq !== masterEtq) {
    return TagInventario.DIVERGENCIA;
  }

  // Se não foi conferido ainda, é PENDENTE
  if (!isConferido) return TagInventario.PENDENTE;

  // 5. CONFERIDO vs ADOTADO vs RE-ADOTADO
  const targetLocKey = normalizeString(targetLocation);
  const originalLocKey = normalizeString(asset.endereco || ""); 
  const currentAuditLocKey = asset._localMaster ? normalizeString(asset._localMaster) : "";

  // RE-ADOTADO: já conferido em OUTRO local durante este inventário (movimentação em tempo real)
  if (currentAuditLocKey !== "" && targetLocKey !== "" && currentAuditLocKey !== targetLocKey) {
    return TagInventario.RE_ADOTADO;
  }

  if (originalLocKey === targetLocKey) {
    return TagInventario.CONFERIDO;
  }

  return TagInventario.ADOTADO;
};

/**
 * TAGs que resultam de uma decisão explícita do auditor e que, por isso, são
 * gravadas e preservadas — não podem ser recalculadas para um valor neutro
 * (ex.: RE-ADOTADO viraria CONFERIDO assim que `_localMaster` fosse atualizado).
 */
const DECISIVE_TAGS: TagInventario[] = [
  TagInventario.ADOTADO_EXTERNO,
  TagInventario.NOVO_ITEM,
  TagInventario.RE_ADOTADO
];

export const resolvePersistedTag = (
  asset: Asset,
  targetLocation: string,
  selectedUnit: string | null
): TagInventario => {
  const stored = asset.TAG_INVENTARIO as TagInventario | undefined;
  if (stored && DECISIVE_TAGS.includes(stored)) return stored;
  return determineAssetTag(asset, targetLocation, selectedUnit);
};

export const getTagMetadata = (tag: TagInventario | undefined): TagMetadata => {
  return TAG_POLICY[tag || TagInventario.PENDENTE] || TAG_POLICY[TagInventario.PENDENTE];
};
