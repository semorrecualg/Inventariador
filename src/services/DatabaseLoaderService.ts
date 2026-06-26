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
   * Executa uma operação assíncrona com backoff exponencial simples para mitigar falhas temporárias e de conexão.
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
    baseDelayMs: number = 1000
  ): Promise<T> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: unknown) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConnectionError = errorMessage.includes('No available connection') || errorMessage.includes('database is locked');
        
        if (attempt > maxRetries) {
          console.error(`>>> [SRE FATAL] Operação falhou após ${maxRetries} tentativas. Erro final: ${errorMessage}`);
          throw error;
        }

        if (isConnectionError) {
          console.warn(`>>> [SRE RETRY] Falha de conexão SQLite detectada (Tentativa ${attempt}/${maxRetries}). Purgando barramento e re-tentando em ${baseDelayMs * Math.pow(2, attempt - 1)}ms...`);
          try {
            await sqliteService.forcePurgeAndConnect();
          } catch (purgeErr) {
            console.error('>>> [SRE PURGE ERR] Falha ao tentar purgar conexões:', purgeErr);
          }
        } else {
          console.warn(`>>> [SRE RETRY] Falha na operação SQLite (Tentativa ${attempt}/${maxRetries}). Erro: ${errorMessage}`);
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  /**
   * Processa o arquivo físico do Excel (ou CSV/JSON), higieniza os dados e injeta no SQLite via lotes de 200.
   */
  public async processExcelFile(
    file: File,
    tenantid: string,
    unitId: string,
    onProgress: (batchIndex: number, insertedCount: number, totalInserted: number, finalPlanilhaTotal: number) => void
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
        if (nav?.getBattery) {
          const battery = await nav.getBattery();
          currentBatteryLevel = battery?.level ?? 1.0;
          isDeviceCharging = battery?.charging ?? true;
        }
      }
    } catch (energyErr) {
      console.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia em DatabaseLoaderService:", energyErr);
    }

    const activeUserJson = typeof window !== 'undefined' ? sessionStorage?.getItem('app_current_user') : null;
    const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
    const activeEmail = activeUser?.email || 'semorr@gmail.com';
    const emailValidoParaBypass = activeEmail?.trim()?.toLowerCase() === 'semorr@gmail.com';

    if (currentBatteryLevel < 0.05 && !isDeviceCharging) {
      if (emailValidoParaBypass) {
        console.warn("⚡ [Soberania Admin] Bateria crítica (< 5%), porém OPERADOR HOMOLOGADO DETECTADO (semorr@gmail.com). Bypass síncrono ativado automaticamente.");
      } else {
        throw new Error("FAILSAFE: Operação abortada. Bateria abaixo de 5% sem fonte externa. Risco de corrupção do cabeçalho .db.");
      }
    }

    // 2. Leitura do arquivo binário e parser via biblioteca XLSX
    const dataBuffer = await this.fileToBuffer(file);
    const workbook = XLSX.read(dataBuffer, { type: "array" });
    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Planilha inválida ou vazia.");
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Converte a planilha em JSON tipado
    const rawRows = XLSX.utils.sheet_to_json<AtivoPlanilha>(worksheet);
    if (!rawRows || rawRows?.length === 0) {
      throw new Error("A planilha fornecida está vazia ou corrompida.");
    }

    // Garante que o banco de dados nativo está inicializado
    if (!sqliteService?.isInitialized) {
      await this.retryWithBackoff(async () => {
        await sqliteService.init();
      });
    }

    // Ativa Flag Global de Isolamento de Carga
    sqliteService.setImportingMode(true);
    await this.retryWithBackoff(async () => {
      await sqliteService.executeRaw("PRAGMA foreign_keys = OFF;");
    });

    let totalInseridos = 0;
    let batchIndex = 0;

    try {
      // Processamento em lotes de 200 (Regra dos 200 Itens)
      const totalRows = rawRows.length;
      for (let i = 0; i < totalRows; i += this.BATCH_SIZE) {
        batchIndex++;
        const chunk = rawRows.slice(i, Math.min(i + this.BATCH_SIZE, totalRows));
        
        await this.retryWithBackoff(async () => {
          for (const row of chunk) {
            // Normalização de chaves flexíveis para garantir suporte a padrões distintos
            const tagVal = String(getRowValue(row, 'etiqueta', 'tag') || '')?.trim();
            const tagSanitizada = tagVal || `ALT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

            const finalId = tagSanitizada;
            const finalFilial = String(getRowValue(row, '_unitid', 'unitid', 'unit_id', 'filial', 'unidade', 'unit') || unitId)?.trim();
            const finalTenantId = String(getRowValue(row, '_tenantid', 'tenantid', 'tenant_id', 'empresa') || tenantid)?.trim();
            const itemDesc = String(
              getRowValue(row, 'descricaodoativo', 'descricao', 'item') || `Ativo N-${finalId}`
            )?.trim();
            const finalRegistro = String(getRowValue(row, 'registro') || `REG-${tagSanitizada}`)?.trim();
            const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
            const contaContabil = String(
              getRowValue(row, 'contacontabil', 'conta_contabil') || 'SEM CONTA'
            )?.trim();
            const statusVal = String(getRowValue(row, 'status') || 'Pendente')?.trim();

            const serialVal = String(getRowValue(row, 'serial') || '')?.trim();
            const dataaqVal = String(getRowValue(row, 'dataaqusic', 'dataaquisic') || '')?.trim();
            const cnpjVal = String(getRowValue(row, 'cnpj') || '')?.trim();
            const fornecedorVal = String(getRowValue(row, 'nomefornecedor', 'fornecedor') || '')?.trim();
            const nfVal = String(getRowValue(row, 'notafiscal') || '')?.trim();
            const finalEndereco = String(
              getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição') || ''
            )?.trim();
            const subregVal = String(getRowValue(row, 'subreg') || '')?.trim();
            const databaixaVal = String(getRowValue(row, 'databaixa') || '')?.trim();
            const primarykeyVal = String(getRowValue(row, 'primarykey') || '')?.trim();
            const centrodecustoVal = String(getRowValue(row, 'centrodecusto', 'centro_custo') || '')?.trim();
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
              finalTenantId,
              finalId,
              statusVal?.toLowerCase()?.includes('conferido') ? 1 : 0,
              0,
              0,
              finalEndereco
            );

            // Atualizações secundárias de suporte à conta_contabil, status, e todos os campos industriais na tabela física
            await sqliteService.execute(
              `UPDATE ativos SET 
                contacontabil = ?, 
                status = ?, 
                serial = ?, 
                dataaqusic = ?, 
                cnpj = ?, 
                nomefornecedor = ?, 
                notafiscal = ?, 
                endereco = ?, 
                subreg = ?, 
                databaixa = ?, 
                primarykey = ?, 
                centrodecusto = ?, 
                sn1_recno = ?, 
                sn3_recno = ? 
               WHERE id = ?;`,
              [
                contaContabil, 
                statusVal, 
                serialVal, 
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
          }
        }, 3, 500);

        totalInseridos += chunk.length;

        // Progresso do lote
        onProgress(batchIndex, chunk.length, totalInseridos, totalRows);
        
        // Pequeno delay artificial para renderização da esteira reativa
        await new Promise(res => setTimeout(res, 40));
      }

      // Gravação no disco físico (Dump Único) com Backoff Exponencial
      await this.retryWithBackoff(async () => {
        await sqliteService.saveDatabase();
      }, 3, 1000);

    } catch (importError: unknown) {
      const err = importError instanceof Error ? importError : new Error(String(importError));
      const errorMeta = {
        message: err.message,
        stack: err.stack || 'Sem stack trace'
      };
      console.error(">>> [CRITICAL IMPORT ERROR] Falha na gravação do lote:", JSON.stringify(errorMeta));
      throw importError;
    } finally {
      // Restabelece isolamento e PRAGMA de chaves
      sqliteService.setImportingMode(false);
      await this.retryWithBackoff(async () => {
        await sqliteService.executeRaw("PRAGMA foreign_keys = ON;");
      }, 2, 500).catch(() => {});
    }

    return totalInseridos;
  }

  /**
   * REQUISITO DE CARGA EXPERT LOTE 0: INGESTÃO DA PLANILHA EXCEL COM BULK INSERT E OOM GUARD (v3.60)
   */
  public async importExcelBulkData(
    file: File,
    tenantid: string,
    unitId: string,
    onProgress: (processed: number, total: number) => void
  ): Promise<number> {
    // 1. Validação Preventiva de Bateria Crítica (< 5% sem fonte externa)
    let currentBatteryLevel = 1.0;
    let isDeviceCharging = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await Device.getBatteryInfo();
        currentBatteryLevel = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
        isDeviceCharging = info.isCharging === true;
      } else {
        const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
        if (nav?.getBattery) {
          const battery = await nav.getBattery();
          currentBatteryLevel = battery?.level ?? 1.0;
          isDeviceCharging = battery?.charging ?? true;
        }
      }
    } catch (energyErr) {
      console.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia em importExcelBulkData:", energyErr);
    }

    const activeUserJson = typeof window !== 'undefined' ? sessionStorage?.getItem('app_current_user') : null;
    const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
    const activeEmail = activeUser?.email || 'semorr@gmail.com';
    const emailValidoParaBypass = activeEmail?.trim()?.toLowerCase() === 'semorr@gmail.com';

    if (currentBatteryLevel < 0.05 && !isDeviceCharging) {
      if (emailValidoParaBypass) {
        console.warn("⚡ [Soberania Admin] Bateria crítica (< 5%), bypass síncrono ativado para semorr@gmail.com.");
      } else {
        throw new Error("FAILSAFE: Operação abortada. Bateria abaixo de 5% sem fonte externa. Risco de corrupção do cabeçalho .db.");
      }
    }

    // 2. Leitura do arquivo binário e parser via biblioteca XLSX
    const dataBuffer = await this.fileToBuffer(file);
    const workbook = XLSX.read(dataBuffer, { type: "array" });
    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Planilha inválida ou vazia.");
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Converte a planilha em JSON tipado
    let rawExcelData: Record<string, unknown>[] | null = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
    const totalPlanilha = rawExcelData?.length ?? 0;
    if (!rawExcelData || totalPlanilha === 0) {
      throw new Error("A planilha fornecida está vazia ou corrompida.");
    }

    // Captura o conteúdo real do campo 'filial' (Index 1) da planilha carregada
    let firstFilial = '';
    for (const row of rawExcelData) {
      const filialVal = String(getRowValue(row, '_unitid', 'unitid', 'unit_id', 'filial', 'unidade', 'unit') || '')?.trim();
      if (filialVal && filialVal.toLowerCase() !== 'null' && filialVal.toLowerCase() !== 'undefined') {
        firstFilial = filialVal;
        break;
      }
    }
    if (firstFilial) {
      console.log(`>>> [SRE Loader] Unidade Física Real detectada no Index 1 (filial): ${firstFilial}`);
      localStorage.setItem('filial', firstFilial);
      sessionStorage.setItem('filial', firstFilial);
      localStorage.setItem('selectedUnit', firstFilial);
      sessionStorage.setItem('selectedUnit', firstFilial);
      localStorage.setItem('app_selected_unit', firstFilial);
      localStorage.setItem('app_current_unit', firstFilial);
    }

    const totalRows = totalPlanilha;
    let totalInserted = 0;

    // Garante inicialização
    if (!sqliteService.isInitialized) {
      await sqliteService.init();
    }

    // Ativa isolamento e PRAGMA de chaves
    sqliteService.setImportingMode(true);
    await sqliteService.executeRaw("PRAGMA foreign_keys = OFF;");

    try {
      const BATCH_SIZE = 200;
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const chunk = rawExcelData.slice(i, Math.min(i + BATCH_SIZE, totalRows));
        const assetsToInsert: Record<string, unknown>[] = [];

        for (const row of chunk) {
          const tagVal = String(getRowValue(row, 'etiqueta', 'tag') || '')?.trim();
          const tagSanitizada = tagVal || `ALT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
          const finalId = tagSanitizada;
          const finalFilial = String(getRowValue(row, '_unitid', 'unitid', 'unit_id', 'filial', 'unidade', 'unit') || unitId)?.trim();
          const finalTenantId = String(getRowValue(row, '_tenantid', 'tenantid', 'tenant_id', 'empresa') || tenantid)?.trim();
          const itemDesc = String(getRowValue(row, 'descricaodoativo', 'descricao', 'item') || `Ativo N-${finalId}`)?.trim();
          const finalRegistro = String(getRowValue(row, 'registro') || `REG-${tagSanitizada}`)?.trim();
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
          const contaContabil = String(getRowValue(row, 'contacontabil', 'conta_contabil') || 'SEM CONTA')?.trim();
          const statusVal = String(getRowValue(row, 'status') || 'Pendente')?.trim();

          const serialVal = String(getRowValue(row, 'serial') || '')?.trim();
          const dataaqVal = String(getRowValue(row, 'dataaqusic', 'dataaquisic') || '')?.trim();
          const cnpjVal = String(getRowValue(row, 'cnpj') || '')?.trim();
          const fornecedorVal = String(getRowValue(row, 'nomefornecedor', 'fornecedor') || '')?.trim();
          const nfVal = String(getRowValue(row, 'notafiscal') || '')?.trim();
          const finalEndereco = String(getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição') || '')?.trim();
          const subregVal = String(getRowValue(row, 'subreg') || '')?.trim();
          const databaixaVal = String(getRowValue(row, 'databaixa') || '')?.trim();
          const primarykeyVal = String(getRowValue(row, 'primarykey') || '')?.trim();
          const centrodecustoVal = String(getRowValue(row, 'centrodecusto', 'centro_custo') || '')?.trim();

          const sn1RecnoRaw = getRowValue(row, 'sn1_recno');
          const sn3RecnoRaw = getRowValue(row, 'sn3_recno');
          const sn1RecnoVal = (sn1RecnoRaw !== undefined && sn1RecnoRaw !== null && !isNaN(Number(sn1RecnoRaw))) ? Number(sn1RecnoRaw) : null;
          const sn3RecnoVal = (sn3RecnoRaw !== undefined && sn3RecnoRaw !== null && !isNaN(Number(sn3RecnoRaw))) ? Number(sn3RecnoRaw) : null;

          // Higienização de Valor de Aquisição
          let vlrAquisicSanitizado = 0;
          let precisaLogarErro = false;
          const valorOriginalRaw = getRowValue(row, 'vlraquisic');

          if (valorOriginalRaw !== undefined && valorOriginalRaw !== null) {
            if (typeof valorOriginalRaw === 'number') {
              vlrAquisicSanitizado = isNaN(valorOriginalRaw) ? 0 : valorOriginalRaw;
              if (isNaN(valorOriginalRaw)) precisaLogarErro = true;
            } else {
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
            ).catch(() => {});
          }

          // Todos os ativos da planilha, sem exceção de conta contábil, devem ser inseridos no banco local com a flag padrão _is_synced = 0
          const finalIsSynced = 0;

          const assetObj = {
            id: finalId,
            tenantid: finalTenantId,
            _tenantid: finalTenantId,
            filial: finalFilial,
            _unitid: finalFilial,
            status: statusVal,
            etiqueta: tagSanitizada,
            tag: tagSanitizada,
            qt: Number(finalQt || 1),
            descricaodoativo: itemDesc,
            serial: serialVal,
            dataaqusic: dataaqVal,
            cnpj: cnpjVal,
            nomefornecedor: fornecedorVal,
            notafiscal: nfVal,
            endereco: finalEndereco,
            registro: finalRegistro,
            subreg: subregVal,
            databaixa: databaixaVal,
            contacontabil: contaContabil,
            primarykey: primarykeyVal || finalId,
            centrodecusto: centrodecustoVal,
            vlraquisic: vlrAquisicSanitizado,
            sn1_recno: sn1RecnoVal,
            sn3_recno: sn3RecnoVal,
            _is_synced: finalIsSynced,
            _is_deleted: 0,
            _conferido: statusVal?.toLowerCase()?.includes('conferido') ? 1 : 0,
            _plaquetado: 0,
            _aprovado: 0,
            _isNew: 0,
            _is_unitized: 0,
            _is_divergent_baixa: 0,
            _history: null,
            DE_PARA: null,
            _photoUrl: null,
            gps_lat: null,
            gps_lng: null
          };

          assetsToInsert.push(assetObj);
        }

        // DESCARGA NO ARMAZENAMENTO LOCAL (Sem Perda em RAM)
        await this.retryWithBackoff(async () => {
          await sqliteService.bulkInsertAssetsOfflineFirst(assetsToInsert);
        }, 3, 500);

        totalInserted += chunk.length;
        if (onProgress) {
          onProgress(totalInserted, totalRows);
        }

        // Pequeno delay artificial para renderização da esteira reativa
        await new Promise(res => setTimeout(res, 30));
      }

      // Gravação no disco físico (Dump Único)
      await this.retryWithBackoff(async () => {
        await sqliteService.saveDatabase();
      }, 3, 1000);

    } finally {
      // COLETA DE LIXO (OOM Guard Ativo): Libera memória e anula referências
      rawExcelData = null;
      
      // Restabelece isolamento e PRAGMA de chaves
      sqliteService.setImportingMode(false);
      await this.retryWithBackoff(async () => {
        await sqliteService.executeRaw("PRAGMA foreign_keys = ON;");
      }, 2, 500).catch(() => {});
    }

    return totalInserted;
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
