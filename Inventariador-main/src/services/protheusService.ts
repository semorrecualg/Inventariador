
import { Asset } from '../types';
import { logger } from '../utils/logger';

/**
 * Serviço de Integração com o ERP Protheus (SIGAATF)
 * Implementa a lógica de normalização, validação e atualização de ativos.
 */

export interface ProtheusUpdateResponse {
  success: boolean;
  message: string;
  recno?: number;
}

/**
 * Mapeia os campos do nosso App para os campos do Protheus (SN1/SN3)
 */
export const normalizeToProtheus = (asset: Asset) => {
  return {
    N1_FILIAL: asset.filial || asset._unitid || '',
    N1_CBASE: asset.ETIQUETA || '',
    N1_ITEM: '0001', // Padrão Protheus para item único
    N1_STATUS: asset.STATUS === 'ATIVO' ? '1' : '0', // Exemplo de mapeamento de status
    N1_LOCAL: asset.ENDERECO || '',
    N3_CUSTBEM: asset.conta_contabil || '',
    N3_CCUSTO: asset.CENTRODECUSTO || '',
    SN1_RECNO: asset.Sn1_recno,
    SN3_RECNO: asset.Sn3_recno
  };
};

/**
 * Valida se o ativo possui os campos mínimos para integração
 */
export const validateForProtheus = (asset: Asset): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!asset.Sn1_recno) {
    errors.push('Identificador Protheus (Sn1_recno) não encontrado.');
  }
  
  if (!asset.Sn3_recno) {
    errors.push('Identificador Protheus (Sn3_recno) não encontrado.');
  }
  
  if (!asset.filial && !asset._unitid) errors.push('Filial (filial) é obrigatória.');
  if (!asset.ETIQUETA) errors.push('Código Base (ETIQUETA) é obrigatório.');
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Simula ou executa a atualização de um ativo no Protheus
 */
export const updateAssetInProtheus = async (
  asset: Asset, 
  apiUrl: string
): Promise<ProtheusUpdateResponse> => {
  const validation = validateForProtheus(asset);
  
  if (!validation.valid) {
    return {
      success: false,
      message: `Erro de Validação: ${validation.errors.join(' ')}`
    };
  }

  const protheusData = normalizeToProtheus(asset);
  const finalApiUrl = apiUrl || import.meta.env.VITE_PROTHEUS_API_URL || 'https://api-protheus-simulada.gbr.com.br/rest';
  logger.info(`Enviando dados para Protheus (${finalApiUrl}):`, protheusData);

  // Simulação de chamada de API
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simula sucesso em 90% dos casos para teste
      const isSuccess = Math.random() > 0.1;
      
      if (isSuccess) {
        resolve({
          success: true,
          message: 'Ativo atualizado com sucesso no Protheus (SIGAATF).',
          recno: asset.Sn1_recno
        });
      } else {
        resolve({
          success: false,
          message: 'Erro na API do Protheus: Time-out ou Filial não encontrada.'
        });
      }
    }, 1500);
  });
};
