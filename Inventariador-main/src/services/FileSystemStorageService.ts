import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { readFileOnTrail, saveFileOnTrail } from './directoryTrailService';

export class FileSystemStorageService {
  private static FILE = 'db_backup_inventario.json';

  /**
   * Backup JSON do inventário. Grava na TRILHA DE DIRETÓRIO (pasta escolhida
   * pelo operador) e, sem ela, em Documentos/armazenamento do app.
   */
  static async salvarEmDiretorioLocal(dados: unknown[]): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false; // Early-return silencioso na Web
    const resultado = await saveFileOnTrail(this.FILE, JSON.stringify(dados, null, 2));
    if (!resultado.saved) {
      console.error('[SRE] Nenhuma pasta aceitou gravar o arquivo físico de salvaguarda.');
      return false;
    }
    return true;
  }

  static async carregarDeDiretorioLocal(): Promise<unknown[] | null> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const conteudo = await readFileOnTrail(this.FILE);
      if (!conteudo) return null;
      return JSON.parse(conteudo) as unknown[];
    } catch {
      return null;
    }
  }

  static async selecionarPlanilhaDoDispositivo(): Promise<Blob | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const resultado = await FilePicker.pickFiles({
          types: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
          limit: 1,
          readData: true
        });
        if (resultado.files && resultado.files.length > 0) {
          const arquivoNativo = resultado.files[0];
          return new Blob([new Uint8Array(atob(arquivoNativo.data || '').split('').map(c => c.charCodeAt(0)))], { type: arquivoNativo.mimeType });
        }
      } catch (err) {
        console.error('[SRE_PICKER] Falha ao navegar nos diretórios móveis:', err);
      }
      return null;
    }
    return null; // Na Web, o input type="file" cuida do explorador nativo
  }
}
