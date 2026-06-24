import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';
import { sqliteService } from './sqliteService';

export interface AtivoPlanilha {
  tag?: string | number;
  TAG?: string | number;
  etiqueta?: string | number;
  ETIQUETA?: string | number;
  vlraquisic?: string | number;
  VLRAQUISIC?: string | number;
  conta_contabil?: string;
  CONTA_CONTABIL?: string;
  contacontabil?: string;
  status?: string;
  STATUS?: string;
  databaixa?: string;
  DATABAIXA?: string;
  descricaodoativo?: string;
  DESCRICAODOATIVO?: string;
  descricao?: string;
  DESCRICAO?: string;
  item?: string;
  ITEM?: string;
  registro?: string;
  REGISTRO?: string;
  qt?: string | number;
  QT?: string | number;
  filial?: string;
  FILIAL?: string;
  endereco?: string;
  ENDERECO?: string;
  localizacao?: string;
  LOCALIZACAO?: string;
  [key: string]: string | number | boolean | null | undefined;
}

function getRowValue(row: AtivoPlanilha, ...keys: string[]): string | number | boolean | null | undefined {
  if (!row) return undefined;
  const rowKeys = Object.keys(row);
  for (const requestedKey of keys) {
    const reqClean = requestedKey.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const foundKey = rowKeys.find(k => {
      const kClean = k.toLowerCase().replace(/[^a-z0-9_]/g, '');
      return kClean === reqClean;
    });
    if (foundKey !== undefined) {
      return row[foundKey];
    }
  }
  return undefined;
}

export class DatabaseLoaderService {
  private BATCH_SIZE = 200;

  /**
   * Processa o arquivo físico do Excel (ou CSV/JSON), higieniza os dados e injeta no SQLite via lotes de 200.
   */
  public async processExcelFile(
    file: File,
    tenantId: string,
    unitId: string,
    onProgress: (batchIndex: number, insertedCount: number, totalInserted: number) => void
  ): Promise<number> {
    
    // 1. Validação Preventiva de Bateria Crítica (< 5% sem fonte externa) com bypass para operador semorr@gmail.com
    let currentBatteryLevel = 1.0;
    let isDeviceCharging = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await Device.getBatteryInfo();
        currentBatteryLevel = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
        isDeviceCharging = info.isCharging === true;
      } else {
        const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
        if (nav.getBattery) {
          const battery = await nav.getBattery();
          currentBatteryLevel = battery.level;
          isDeviceCharging = battery.charging;
        }
      }
    } catch (energyErr) {
      console.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia em DatabaseLoaderService:", energyErr);
    }

    const activeUserJson = typeof window !== 'undefined' ? sessionStorage.getItem('app_current_user') : null;
    const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
    const activeEmail = activeUser?.email || 'semorr@gmail.com';
    const emailValidoParaBypass = activeEmail.trim().toLowerCase() === 'semorr@gmail.com';

    if (currentBatteryLevel < 0.05 && !isDeviceCharging) {
      if (emailValidoParaBypass) {
        console.warn("⚡ [Soberania Admin] Bateria crítica (< 5%), porém OPERADOR HOMOLOGADO DETECTADO (semorr@gmail.com). Bypass síncrono ativado automaticamente.");
      } else {
        throw new Error("FAILSAFE: Operação abortada. Bateria abaixo de 5% sem fonte externa. Risco de corrupção do cabeçalho .db.");
      }
    }

    // 2. Leitura do arquivo binário e parser via biblioteca XLSX
    const data = await this.fileToBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Converte a planilha em JSON tipado
    const rawRows = XLSX.utils.sheet_to_json<AtivoPlanilha>(worksheet);
    if (!rawRows || rawRows.length === 0) {
      throw new Error("A planilha fornecida está vazia ou corrompida.");
    }

    // Ativa Flag Global de Isolamento de Carga
    sqliteService.setImportingMode(true);
    await sqliteService.executeRaw("PRAGMA foreign_keys = OFF;");

    let totalInseridos = 0;
    let batchIndex = 0;

    try {
      // Inicia Transação Primária Geral
      await sqliteService.beginTransaction();

      // Processamento em lotes de 200 (Regra dos 200 Itens)
      for (let i = 0; i < rawRows.length; i += this.BATCH_SIZE) {
        batchIndex++;
        const chunk = rawRows.slice(i, i + this.BATCH_SIZE);
        
        for (const row of chunk) {
          // Normalização de chaves flexíveis para garantir suporte a padrões distintos
          const tagVal = String(getRowValue(row, 'etiqueta', 'tag') || '').trim();
          const tagSanitizada = tagVal || `ALT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

          const finalId = tagSanitizada;
          const finalFilial = String(getRowValue(row, 'filial') || unitId).trim();
          const itemDesc = String(
            getRowValue(row, 'descricaodoativo', 'descricao', 'item') || `Ativo N-${finalId}`
          ).trim();
          const finalRegistro = String(getRowValue(row, 'registro') || `REG-${tagSanitizada}`).trim();
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1').trim();
          const contaContabil = String(
            getRowValue(row, 'contacontabil', 'conta_contabil') || 'SEM CONTA'
          ).trim();
          const statusVal = String(getRowValue(row, 'status') || 'Pendente').trim();

          const serialVal = String(getRowValue(row, 'serial') || '').trim();
          const dataaqVal = String(getRowValue(row, 'dataaqusic', 'dataaquisic') || '').trim();
          const cnpjVal = String(getRowValue(row, 'cnpj') || '').trim();
          const fornecedorVal = String(getRowValue(row, 'nomefornecedor', 'fornecedor') || '').trim();
          const nfVal = String(getRowValue(row, 'notafiscal') || '').trim();
          const finalEndereco = String(
            getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição') || ''
          ).trim();
          const subregVal = String(getRowValue(row, 'subreg') || '').trim();
          const databaixaVal = String(getRowValue(row, 'databaixa') || '').trim();
          const primarykeyVal = String(getRowValue(row, 'primarykey') || '').trim();
          const centrodecustoVal = String(getRowValue(row, 'centrodecusto', 'centro_custo') || '').trim();
          const sn1RecnoRaw = getRowValue(row, 'sn1_recno');
          const sn3RecnoRaw = getRowValue(row, 'sn3_recno');
          const sn1RecnoVal = (sn1RecnoRaw !== undefined && sn1RecnoRaw !== null && !isNaN(Number(sn1RecnoRaw))) ? Number(sn1RecnoRaw) : null;
          const sn3RecnoVal = (sn3RecnoRaw !== undefined && sn3RecnoRaw !== null && !isNaN(Number(sn3RecnoRaw))) ? Number(sn3RecnoRaw) : null;

          // HIGIENIZAÇÃO CONTÁBIL EXIGIDA PELO LAUDO SRE: Higienização de Valor de Aquisição
          let vlrAquisicSanitizado = 0;
          let precisaLogarErro = false;
          const valorOriginalRaw = getRowValue(row, 'vlraquisic');

          if (valorOriginalRaw !== undefined && valorOriginalRaw !== null) {
            if (typeof valorOriginalRaw === 'number') {
              if (isNaN(valorOriginalRaw)) {
                vlrAquisicSanitizado = 0;
                precisaLogarErro = true;
              } else {
                vlrAquisicSanitizado = valorOriginalRaw;
              }
            } else {
              // Remove R$, espaços e ajusta separadores (Padrão BR -> Float JS)
              const cleanStr = String(valorOriginalRaw).replace(/[R$\s]/gi, '');
              if (cleanStr.includes(',') && cleanStr.includes('.')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/\./g, '').replace(/,/g, '.'));
              } else if (cleanStr.includes(',')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/,/g, '.'));
              } else {
                vlrAquisicSanitizado = parseFloat(cleanStr);
              }

              if (isNaN(vlrAquisicSanitizado)) {
                vlrAquisicSanitizado = 0;
                precisaLogarErro = true;
              }
            }
          }

          // Se o valor foi rebaixado a zero, dispara logs de auditoria (bypassing importing batch block)
          if (precisaLogarErro) {
            await sqliteService.logAuditEvent(
              activeEmail,
              'CORRECTION_VLR_INIT_ZERO',
              'ativos',
              tagSanitizada,
              JSON.stringify({
                msg: "Saneamento de valor de aquisição corrompido para '0' na importação Excel",
                valorOriginal: valorOriginalRaw
              })
            ).catch(err => console.error(">>> [SRE ERR] Falha ao gravar log no DatabaseLoaderService:", err));
          }

          // Ingestão direta na camada nativa
          await sqliteService.inserirAtivoDireto(
            tagSanitizada,
            vlrAquisicSanitizado,
            finalFilial,
            itemDesc,
            finalRegistro,
            finalQt,
            tenantId,
            finalId,
            statusVal.toLowerCase().includes('conferido') ? 1 : 0,
            0,
            0,
            finalEndereco
          );

          // Atualizações secundárias de suporte à conta_contabil, status, e todos os campos industriais na tabela física
          await sqliteService.execute(
            `UPDATE Ativos SET 
              conta_contabil = ?, 
              contacontabil = ?, 
              TAG_INVENTARIO = ?, 
              STATUS = ?, 
              SERIAL = ?, 
              dataaqusic = ?, 
              DATAAQUISIC = ?, 
              CNPJ = ?, 
              NOMEFORNECEDOR = ?, 
              NOTAFISCAL = ?, 
              ENDERECO = ?, 
              SUBREG = ?, 
              DATABAIXA = ?, 
              PRIMARYKEY = ?, 
              CENTRODECUSTO = ?, 
              Sn1_recno = ?, 
              Sn3_recno = ? 
             WHERE id = ?;`,
            [
              contaContabil, 
              contaContabil, 
              statusVal, 
              statusVal, 
              serialVal, 
              dataaqVal, 
              dataaqVal, 
              cnpjVal, 
              fornecedorVal, 
              nfVal, 
              finalEndereco, 
              subregVal, 
              databaixaVal, 
              primarykeyVal, 
              centrodecustoVal, 
              sn1RecnoVal !== undefined && sn1RecnoVal !== null ? Number(sn1RecnoVal) : null,
              sn3RecnoVal !== undefined && sn3RecnoVal !== null ? Number(sn3RecnoVal) : null,
              finalId
            ]
          ).catch(err => console.error(">>> [SQL ERR] Falha ao atualizar dados adicionais:", err));

          totalInseridos++;
        }

        // Progresso do lote
        onProgress(batchIndex, chunk.length, totalInseridos);
      }

      // Confirmação atômica segura no SQLite nativo
      await sqliteService.commitTransaction();

      // Gravação no disco físico (Dump Único)
      await sqliteService.saveDatabase();

    } catch (importError) {
      console.error(">>> [CRITICAL IMPORT ERROR] Erro na gravação do lote. Executando Rollback...", importError);
      try {
        await sqliteService.rollbackTransaction();
      } catch (rollbackErr) {
        console.error(">>> [FATAL ROLLBACK ERROR] Falha ao reverter transação físico de banco:", rollbackErr);
      }
      throw importError;
    } finally {
      // Restabelece isolamento e PRAGMA de chaves
      sqliteService.setImportingMode(false);
      await sqliteService.executeRaw("PRAGMA foreign_keys = ON;").catch(() => {});
    }

    return totalInseridos;
  }

  /**
   * Converte o arquivo carregado em Buffer binário na memória RAM para leitura XLSX
   */
  private fileToBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Falha ao ler dados binários do arquivo."));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

export const databaseLoaderService = new DatabaseLoaderService();
