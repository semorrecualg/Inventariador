import type { Asset } from '../types';

/**
 * CÓPIA DE DADOS ENTRE REGISTOS — "não localizado" em outra unidade
 * ============================================================================
 * Quando a plaqueta não existe na unidade em inventário, o auditor pesquisa as
 * outras unidades, vê a **Ficha do Ativo** e copia os dados descritivos para um
 * item novo DESTA unidade. O registo de origem nunca é alterado.
 *
 * A cópia é uma **lista branca**: só viajam campos que descrevem o bem.
 *
 * IDENTIDADE DO REGISTRO ADOTADO
 * ----------------------------------------------------------------------------
 *     rad_<UNIDADE>_<DISPOSITIVO>_<000001>
 *     ex.: rad_010101_7K3F_000001
 *
 * - `rad_` = **REGISTRO ADOTADO**;
 * - `<UNIDADE>` = primeiro token da unidade (até 8 caracteres A-Z0-9);
 * - `<DISPOSITIVO>` = código curto e estável desta instalação (4 caracteres);
 * - `<000001>` = sequência crescente **por unidade e por dispositivo**, lida do
 *   contador persistido e de todos os `rad_` já existentes na base.
 *
 * Sem o código da unidade e o do dispositivo, dois aparelhos inventariando a
 * mesma unidade (ou dois que começam em `000001`) geravam o **mesmo** registro —
 * a duplicidade que este rótulo existe para evitar. O contador persistido
 * garante que a série continua mesmo que o item anterior seja apagado ou a
 * gravação falhe.
 *
 * `registro` recebe o MESMO rótulo de `rad_recno`: é por `registro` que o
 * De/Para e a conferência em lote agrupam os sub-itens. Como cada cópia abre um
 * registro novo, `subreg` é sempre `0001` — não há segundo sub-item no mesmo
 * registro nesta operação.
 *
 * O `sn1_recno` da origem nunca é copiado (sobe nulo, sem duplicar a chave de
 * ninguém); os valores originais ficam em `_copiadoDeRecno` e
 * `_copiadoDeRegistro`.
 */

/** Campos que descrevem o bem e podem ser copiados para o item novo. */
export const CAMPOS_DESCRITIVOS = [
  'descricaodoativo',
  'serial',
  'qt',
  'dataaqusic',
  'nomefornecedor',
  'notafiscal',
  'vlraquisic',
  'contacontabil',
  'centrodecusto',
] as const satisfies ReadonlyArray<keyof Asset>;

export type CampoDescritivo = (typeof CAMPOS_DESCRITIVOS)[number];

/** Prefixo do REGISTRO ADOTADO. */
export const RAD_PREFIX = 'rad_';
/** Sub-item do registro: cada cópia abre um registro novo, logo é sempre o 1º. */
export const SUBREG_ADOTADO = '0001';
const RAD_DIGITS = 6;
const UNIT_MAX = 8;
const DEVICE_MAX = 4;
const UNIT_FALLBACK = 'UNID';
const DEVICE_FALLBACK = 'DEV1';

/** Só A-Z0-9, em maiúsculas, truncado — o rótulo vai para planilha e tela. */
const codigo = (valor: unknown, max: number, fallback: string): string => {
  const limpo = String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return limpo ? limpo.slice(0, max) : fallback;
};

/** Primeiro token da unidade: `"010101 CICOPAL GO"` → `010101`. */
export const unitCode = (unidade: unknown): string => {
  const primeiro = String(unidade ?? '').trim().split(/\s+/)[0] ?? '';
  return codigo(primeiro, UNIT_MAX, UNIT_FALLBACK);
};

/** Código curto da instalação; sem ele a série não é única entre aparelhos. */
export const deviceCode = (dispositivo: unknown): string =>
  codigo(dispositivo, DEVICE_MAX, DEVICE_FALLBACK);

/** Prefixo do rótulo: `rad_010101_7K3F_`. */
export const radPrefix = (unidade: unknown, dispositivo: unknown): string =>
  `${RAD_PREFIX}${unitCode(unidade)}_${deviceCode(dispositivo)}_`;

/** Rótulo completo a partir da sequência. */
export const radLabel = (
  unidade: unknown,
  dispositivo: unknown,
  sequencia: number,
): string => {
  const n = Number.isFinite(sequencia) ? Math.max(1, Math.trunc(sequencia)) : 1;
  return `${radPrefix(unidade, dispositivo)}${String(n).padStart(RAD_DIGITS, '0')}`;
};

/**
 * Sequência de um rótulo RAD — aceita o formato novo
 * (`rad_010101_7K3F_000001`) e o legado (`rad_000001`).
 */
export const radSequenceOf = (valor: unknown): number | null => {
  const match = /^rad_(?:[A-Z0-9]+_)*(\d+)$/i.exec(String(valor ?? '').trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
};

type ItemExistente = Partial<Asset> | null | undefined;

const valorDe = (item: ItemExistente, chave: string): unknown => {
  if (!item) return undefined;
  return (item as Record<string, unknown>)[chave];
};

/**
 * Próximo rótulo livre para esta unidade/dispositivo.
 * Considera o maior `rad_` do MESMO prefixo já na base e o contador persistido
 * (que sobrevive a itens apagados e a gravações que falharam).
 */
export const nextRadLabel = (
  unidade: unknown,
  dispositivo: unknown,
  existentes: readonly ItemExistente[] = [],
  ultimoContador = 0,
): string => {
  const prefixo = radPrefix(unidade, dispositivo).toUpperCase();
  let maior = Number.isFinite(ultimoContador) ? Math.max(0, Math.trunc(ultimoContador)) : 0;

  for (const item of existentes) {
    for (const chave of ['rad_recno', 'registro']) {
      const bruto = String(valorDe(item, chave) ?? '').trim();
      if (!bruto.toUpperCase().startsWith(prefixo)) continue;
      const seq = radSequenceOf(bruto);
      if (seq !== null && seq > maior) maior = seq;
    }
  }

  return radLabel(unidade, dispositivo, maior + 1);
};

export interface DestinoDoItemNovo {
  /** Unidade selecionada e autorizada no ecrã. */
  unidade: string | null | undefined;
  /** Endereço de inventário aberto (o mesmo que o App usa em `_localMaster`). */
  endereco: string | null | undefined;
  /** Código lido/digitado que disparou a busca. Sem ele usa a plaqueta de origem. */
  etiqueta?: string | null;
  /** Código desta instalação (estável): sem ele, dois aparelhos repetem a série. */
  dispositivo?: string | null;
  /** Último número emitido nesta unidade, vindo do contador persistido. */
  ultimoContador?: number;
  /** Data de hoje, no formato do app — injetada para o teste ser determinístico. */
  hoje?: string;
}

const naoVazio = (valor: unknown): boolean => {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  return true;
};

/**
 * Monta o `Partial<Asset>` que pré-preenche o formulário de item novo.
 * Função pura: não toca no registo de origem nem em estado de tela.
 */
export const buildCopyForNewItem = (
  origem: Asset,
  destino: DestinoDoItemNovo,
  existentes: readonly ItemExistente[] = [],
): Partial<Asset> => {
  const copia: Partial<Asset> = {};

  for (const campo of CAMPOS_DESCRITIVOS) {
    const valor = origem[campo];
    if (naoVazio(valor)) {
      (copia as Record<string, unknown>)[campo] = valor;
    }
  }

  const etiqueta = String(destino.etiqueta || origem.etiqueta || '').trim().toUpperCase();
  const registroAdotado = nextRadLabel(
    destino.unidade,
    destino.dispositivo,
    existentes,
    destino.ultimoContador ?? 0,
  );
  const recnoOrigem = origem.sn1_recno;

  return {
    ...copia,
    etiqueta,
    qt: origem.qt && origem.qt > 0 ? origem.qt : 1,
    dataaqusic: origem.dataaqusic || destino.hoje || '',
    // IDENTIDADE DO REGISTRO ADOTADO: rótulo próprio, sem herdar `sn1_recno`
    // nem `registro` da origem.
    registro: registroAdotado,
    subreg: SUBREG_ADOTADO,
    rad_recno: registroAdotado,
    filial: destino.unidade || '',
    endereco: destino.endereco || '',
    AUDITOR_LOCAL_AUDITADO: destino.endereco || '',
    status: 'ATIVO',
    _copiadoDe: origem.filial || origem._unitid || '',
    _copiadoDeEtiqueta: origem.etiqueta || '',
    _copiadoDeRegistro: origem.registro || '',
    _copiadoDeRecno: typeof recnoOrigem === 'number' ? recnoOrigem : null,
  };
};

/* ============================================================================
 * CONTADOR PERSISTIDO + CÓDIGO DO DISPOSITIVO (localStorage)
 * O rótulo já é único por unidade+dispositivo; o contador evita reaproveitar
 * um número quando o item anterior é apagado, muda de unidade ou a gravação
 * falha. Falha de storage nunca impede a cópia.
 * ========================================================================== */

const DEVICE_KEY = 'gbr_rad_device';
const COUNTER_KEY = 'gbr_rad_counter';

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Código desta instalação, criado na primeira cópia e mantido para sempre. */
export const getDeviceCode = (): string => {
  const store = storage();
  const salvo = store?.getItem(DEVICE_KEY) || '';
  if (salvo) return deviceCode(salvo);

  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let novo = '';
  try {
    const bytes = new Uint8Array(DEVICE_MAX);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (const b of bytes) novo += alfabeto[b % alfabeto.length];
  } catch {
    novo = DEVICE_FALLBACK;
  }
  novo = deviceCode(novo);
  try {
    store?.setItem(DEVICE_KEY, novo);
  } catch {
    /* storage indisponível: o código vale só para esta sessão */
  }
  return novo;
};

const lerContadores = (): Record<string, number> => {
  try {
    const bruto = storage()?.getItem(COUNTER_KEY);
    if (!bruto) return {};
    const parsed = JSON.parse(bruto) as Record<string, unknown>;
    const saida: Record<string, number> = {};
    Object.keys(parsed).forEach(chave => {
      const n = Number(parsed[chave]);
      if (Number.isFinite(n) && n > 0) saida[chave] = Math.trunc(n);
    });
    return saida;
  } catch {
    return {};
  }
};

/** Chave do contador: unidade + dispositivo (cada aparelho tem a sua série). */
const counterKey = (unidade: unknown, dispositivo: string): string =>
  `${unitCode(unidade)}_${deviceCode(dispositivo)}`;

/** Último número emitido para esta unidade nesta instalação. */
export const readRadCounter = (unidade: unknown, dispositivo: string): number =>
  lerContadores()[counterKey(unidade, dispositivo)] ?? 0;

/** Grava o último número emitido; nunca lança. */
export const writeRadCounter = (
  unidade: unknown,
  dispositivo: string,
  sequencia: number,
): void => {
  if (!Number.isFinite(sequencia) || sequencia <= 0) return;
  try {
    const contadores = lerContadores();
    const chave = counterKey(unidade, dispositivo);
    const atual = contadores[chave] ?? 0;
    if (sequencia <= atual) return;
    contadores[chave] = Math.trunc(sequencia);
    storage()?.setItem(COUNTER_KEY, JSON.stringify(contadores));
  } catch {
    /* storage indisponível: a base continua a ser a fonte da sequência */
  }
};
