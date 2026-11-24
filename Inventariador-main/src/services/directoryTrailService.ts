// src/services/directoryTrailService.ts
// TRILHA DE DIRETÓRIO — endereço físico do app no telemóvel.
//
// O operador escolhe a planilha da base navegando nas pastas do aparelho; essa
// pasta passa a ser a TRILHA: o endereço único onde o app procura e grava tudo o
// que gera (pacote de backup, espelhos locais, backups físicos). Antes o caminho
// escolhido era descartado e cada rotina gravava numa pasta fixa — no APK o
// operador exportava e não sabia onde o ficheiro tinha ficado.
//
// A trilha é gravada em `localStorage` (sobrevive a fechar a app, ao contrário
// do `sessionStorage` usado pelo vínculo antigo) e mostrada na UI.
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { logger } from '../utils/logger';

export const DIRECTORY_TRAIL_KEY = 'gbr_directory_trail';
/** Pasta estrutural usada quando a trilha não tem caminho gravável. */
export const TRAIL_FOLDER = 'GBR_KARDEK_DATA';

/** Como a trilha foi obtida: pasta escolhida ou pasta da planilha carregada. */
export type DirectoryTrailOrigin = 'pasta-escolhida' | 'planilha';

export interface DirectoryTrail {
  /** Caminho físico legível (ex.: `/storage/emulated/0/Download/GBR`). */
  path: string;
  /** Último segmento do caminho (nome da pasta). */
  folderName: string;
  /** Planilha que revelou a pasta (vazio quando a pasta foi escolhida à mão). */
  sourceFileName: string;
  origem: DirectoryTrailOrigin;
  plataforma: 'android' | 'web';
  /**
   * Caminho relativo à raiz do armazenamento externo (`Download/GBR`). Só
   * existe para pastas públicas do Android — é a forma que o Capacitor
   * Filesystem aceita (`Directory.ExternalStorage`).
   */
  externalRelativePath?: string;
  capturedAt: string;
}

/** Raiz do armazenamento interno no Android (`/sdcard` é o mesmo sítio). */
const EXTERNAL_ROOT = '/storage/emulated/0';

/**
 * Converte o caminho devolvido por um seletor do Android (SAF `content://`,
 * `file://` ou caminho absoluto) no caminho físico da pasta.
 *
 * - `.../tree/primary%3ADownload%2FGBR` → `/storage/emulated/0/Download/GBR`
 * - `.../document/primary%3ADownload%2Fbase.xlsx` (ficheiro) → `.../Download`
 * - `file:///storage/emulated/0/Download/base.xlsx` → `.../Download`
 *
 * Devolve `null` quando o caminho não identifica uma pasta conhecida (ex.:
 * provedor de nuvem em `content://`), para a UI não mostrar um endereço falso.
 */
export function physicalPathFromPicker(raw: string, kind: 'pasta' | 'ficheiro'): string | null {
  let valor = (raw ?? '').trim();
  if (!valor) return null;
  try {
    valor = decodeURIComponent(valor);
  } catch {
    /* percentagem inválida: usa o valor como veio */
  }
  valor = valor.replace(/^file:\/\//i, '').replace(/\/+$/, '');

  if (/^content:\/\//i.test(valor)) {
    const marcador = valor.includes('/tree/') ? '/tree/' : valor.includes('/document/') ? '/document/' : '';
    if (!marcador) return null;
    const docId = valor.slice(valor.indexOf(marcador) + marcador.length);
    const separador = docId.indexOf(':');
    if (separador <= 0) return null;
    const volume = docId.slice(0, separador).toLowerCase();
    const resto = docId.slice(separador + 1).replace(/^\/+/, '');
    const raiz = volume === 'primary'
      ? EXTERNAL_ROOT
      : volume === 'home'
        ? `${EXTERNAL_ROOT}/Documents`
        : null;
    if (!raiz) return null;
    const partes = resto.split('/').filter(Boolean);
    if (kind === 'ficheiro' && partes.length > 0) partes.pop();
    return partes.length > 0 ? `${raiz}/${partes.join('/')}` : raiz;
  }

  if (!valor.startsWith('/')) return null;
  const normalizado = valor.replace(/^\/sdcard(?=\/|$)/, EXTERNAL_ROOT);
  const partes = normalizado.split('/').filter(Boolean);
  if (kind === 'ficheiro' && partes.length > 0) partes.pop();
  return partes.length > 0 ? `/${partes.join('/')}` : null;
}

/** Caminho relativo ao armazenamento externo (`''` quando é a própria raiz). */
export function externalRelativePathOf(path: string): string | undefined {
  if (path === EXTERNAL_ROOT) return '';
  if (!path.startsWith(`${EXTERNAL_ROOT}/`)) return undefined;
  return path.slice(EXTERNAL_ROOT.length + 1);
}

/** Monta a trilha a partir do caminho devolvido pelo seletor nativo. */
export function buildDirectoryTrail(
  rawPath: string,
  options: { origem: DirectoryTrailOrigin; sourceFileName?: string }
): DirectoryTrail | null {
  const path = physicalPathFromPicker(rawPath, options.origem === 'planilha' ? 'ficheiro' : 'pasta');
  if (!path) return null;
  const partes = path.split('/').filter(Boolean);
  return {
    path,
    folderName: partes[partes.length - 1] ?? path,
    sourceFileName: options.sourceFileName ?? '',
    origem: options.origem,
    plataforma: 'android',
    externalRelativePath: externalRelativePathOf(path),
    capturedAt: new Date().toISOString()
  };
}

/** Trilha na Web: o navegador só revela o nome da pasta (sem caminho físico). */
export function buildWebDirectoryTrail(folderName: string): DirectoryTrail {
  const nome = (folderName || '').trim() || TRAIL_FOLDER;
  return {
    path: nome,
    folderName: nome,
    sourceFileName: '',
    origem: 'pasta-escolhida',
    plataforma: 'web',
    capturedAt: new Date().toISOString()
  };
}

/** Grava a trilha (persistente) e mantém o vínculo legado das telas antigas. */
export function saveDirectoryTrail(trail: DirectoryTrail): void {
  try {
    localStorage.setItem(DIRECTORY_TRAIL_KEY, JSON.stringify(trail));
    localStorage.setItem('gbr_physical_link_active', 'true');
    sessionStorage.setItem('gbr_physical_folder_name', trail.folderName);
  } catch (err) {
    logger.warn('[SRE_TRILHA] Não foi possível gravar a trilha de diretório:', err);
  }
}

/**
 * Captura a trilha a partir do caminho do seletor. Devolve `null` (e não grava
 * nada) quando o caminho não é uma pasta física reconhecida.
 */
export function captureDirectoryTrail(
  rawPath: string,
  options: { origem: DirectoryTrailOrigin; sourceFileName?: string }
): DirectoryTrail | null {
  const trail = buildDirectoryTrail(rawPath, options);
  if (!trail) {
    logger.warn(`[SRE_TRILHA] Caminho sem pasta física reconhecida: ${rawPath || '(vazio)'}`);
    return null;
  }
  saveDirectoryTrail(trail);
  logger.info(
    `[SRE_TRILHA] Trilha de diretório: ${trail.path} (${trail.origem}${trail.sourceFileName ? ` · ${trail.sourceFileName}` : ''}).`
  );
  return trail;
}

/** Trilha gravada neste aparelho (ou `null` se ainda não houve escolha). */
export function getDirectoryTrail(): DirectoryTrail | null {
  try {
    const raw = localStorage.getItem(DIRECTORY_TRAIL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DirectoryTrail> | null;
    if (!parsed || typeof parsed.path !== 'string' || !parsed.path) return null;
    return {
      path: parsed.path,
      folderName: parsed.folderName || parsed.path.split('/').filter(Boolean).pop() || parsed.path,
      sourceFileName: parsed.sourceFileName ?? '',
      origem: parsed.origem === 'planilha' ? 'planilha' : 'pasta-escolhida',
      plataforma: parsed.plataforma === 'web' ? 'web' : 'android',
      externalRelativePath: parsed.externalRelativePath ?? externalRelativePathOf(parsed.path),
      capturedAt: parsed.capturedAt ?? ''
    };
  } catch {
    return null;
  }
}

/** Remove a trilha (o app volta a gravar na pasta estrutural padrão). */
export function clearDirectoryTrail(): void {
  try {
    localStorage.removeItem(DIRECTORY_TRAIL_KEY);
    localStorage.removeItem('gbr_physical_link_active');
  } catch { /* best-effort */ }
  try {
    sessionStorage.removeItem('gbr_physical_folder_name');
  } catch { /* best-effort */ }
}

/** Onde o ficheiro acabou por ser gravado. */
export type TrailDestination = 'trilha' | 'documentos' | 'app';

export interface TrailWriteResult {
  saved: boolean;
  destino?: TrailDestination;
  /** Caminho legível para o operador (inclui o nome do ficheiro). */
  path?: string;
  /** URI devolvido pelo Capacitor (`file://…`). */
  uri?: string;
  /** Pastas tentadas, por ordem. */
  tentativas: string[];
}

interface TrailCandidate {
  directory: Directory;
  path: string;
  label: string;
  destino: TrailDestination;
}

/**
 * Ordem de gravação: a TRILHA primeiro (é o endereço que o operador escolheu);
 * sem caminho público gravável, Documentos e, por fim, o armazenamento do app.
 */
function writeCandidates(fileName: string): TrailCandidate[] {
  const candidatos: TrailCandidate[] = [];
  const trail = getDirectoryTrail();
  if (trail && trail.externalRelativePath !== undefined) {
    const base = trail.externalRelativePath ? `${trail.externalRelativePath}/` : '';
    candidatos.push({
      directory: Directory.ExternalStorage,
      path: `${base}${fileName}`,
      label: `${trail.path}/${fileName}`,
      destino: 'trilha'
    });
  }
  candidatos.push({
    directory: Directory.Documents,
    path: `${TRAIL_FOLDER}/${fileName}`,
    label: `Documentos/${TRAIL_FOLDER}/${fileName}`,
    destino: 'documentos'
  });
  candidatos.push({
    directory: Directory.External,
    path: `${TRAIL_FOLDER}/${fileName}`,
    label: `Armazenamento do app/${TRAIL_FOLDER}/${fileName}`,
    destino: 'app'
  });
  return candidatos;
}

/**
 * Grava um ficheiro do app na trilha do telefone. Sem trilha definida (ou sem
 * permissão na pasta), cai para Documentos e para o armazenamento do app — e
 * devolve o caminho REAL usado, para a UI nunca deixar o operador às escuras.
 */
export async function saveFileOnTrail(fileName: string, data: string): Promise<TrailWriteResult> {
  if (!Capacitor.isNativePlatform()) return { saved: false, tentativas: [] };

  const tentativas: string[] = [];
  let ultimoErro: unknown = null;
  for (const candidato of writeCandidates(fileName)) {
    tentativas.push(candidato.label);
    try {
      const escrito = await Filesystem.writeFile({
        path: candidato.path,
        data,
        directory: candidato.directory,
        encoding: Encoding.UTF8,
        recursive: true
      });
      logger.info(`[SRE_TRILHA] ${fileName} gravado em ${candidato.label} (${escrito.uri}).`);
      return {
        saved: true,
        destino: candidato.destino,
        path: candidato.label,
        uri: escrito.uri,
        tentativas
      };
    } catch (error) {
      ultimoErro = error;
    }
  }

  logger.error(`[SRE_TRILHA] Nenhuma pasta aceitou gravar ${fileName}:`, ultimoErro);
  return { saved: false, tentativas };
}

/**
 * Lê um ficheiro do app pela mesma trilha (trilha → Documentos → app).
 * Devolve `null` quando nenhuma pasta tem o ficheiro ou fora do nativo.
 */
export async function readFileOnTrail(fileName: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  for (const candidato of writeCandidates(fileName)) {
    try {
      const lido = await Filesystem.readFile({
        path: candidato.path,
        directory: candidato.directory,
        encoding: Encoding.UTF8
      });
      if (typeof lido.data === 'string' && lido.data) return lido.data;
    } catch {
      /* tenta a pasta seguinte */
    }
  }
  return null;
}
