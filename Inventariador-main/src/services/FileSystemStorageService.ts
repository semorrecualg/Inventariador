import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Capacitor } from '@capacitor/core';

export class FileSystemStorageService {
  private static DIR = 'GBR_KARDEK_DATA';
  private static FILE = 'db_backup_inventario.json';

  static async salvarEmDiretorioLocal(dados: unknown[]): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false; // Early-return silencioso na Web
    try {
      await Filesystem.writeFile({
        path: `${this.DIR}/${this.FILE}`,
        data: JSON.stringify(dados, null, 2),
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      });
      return true;
    } catch (error) {
      console.error('[SRE] Erro ao gravar arquivo físico de salvaguarda:', error);
      return false;
    }
  }

  static async carregarDeDiretorioLocal(): Promise<unknown[] | null> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const arquivo = await Filesystem.readFile({
        path: `${this.DIR}/${this.FILE}`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      return JSON.parse(arquivo.data as string) as unknown[];
    } catch {
      return null;
    }
  }

  static async selecionarPlanilhaDoDispositivo(): Promise<Blob | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const resultado = await FilePicker.pickFiles({
          types: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
          multiple: false,
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
