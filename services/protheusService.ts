
import { Asset } from '../types';

/**
 * Serviço de Integração com o ERP Protheus (SIGAATF)
 * Implementa a lógica de normalização, validação e atualização de ativos.
 */

export interface ProtheusUpdateResponse {
  success: boolean;
  message: string;
  recno?: number;
}

export interface ProtheusAuthResponse {
  success: boolean;
  message: string;
  user?: {
    username: string;
    email: string;
  };
}

/**
 * Simula a autenticação de um usuário no ERP Protheus
 */
export const authenticateWithProtheus = async (
  username: string,
  password: string
): Promise<ProtheusAuthResponse> => {
  console.log(`Autenticando usuário ${username} no Protheus...`);

  // Simulação de chamada de API de autenticação
  return new Promise((resolve) => {
    setTimeout(() => {
      // Para fins de teste/protótipo:
      // Se a senha for 'admin' ou 'gbr123', autentica com sucesso
      // Ou se for o email do usuário principal
      const isSuccess = password === 'admin' || password === 'gbr123' || username.toLowerCase() === 'semorr@gmail.com';
      
      if (isSuccess) {
        resolve({
          success: true,
          message: 'Autenticação Protheus realizada com sucesso.',
          user: {
            username: username.toUpperCase(),
            email: username.includes('@') ? username.toLowerCase() : `${username.toLowerCase()}@gbr.com.br`
          }
        });
      } else {
        resolve({
          success: false,
          message: 'Usuário ou senha inválidos no ERP Protheus.'
        });
      }
    }, 1200);
  });
};

/**
 * Mapeia os campos do nosso App para os campos do Protheus (SN1/SN3)
 * @param asset Ativo do App
 * @returns Objeto formatado para a API do Protheus
 */
export const normalizeToProtheus = (asset: Asset) => {
  return {
    N1_FILIAL: asset.EMPRESA || '',
    N1_CBASE: asset.ETIQUETA || '',
    N1_ITEM: '0001', // Padrão Protheus para item único
    N1_STATUS: asset.STATUS === 'ATIVO' ? '1' : '0', // Exemplo de mapeamento de status
    N1_LOCAL: asset.ENDERECO || '',
    N3_CUSTBEM: asset.CONTACONTABIL || '',
    N3_CCUSTO: asset.CENTRODECUSTO || '',
    SN1_RECNO: asset.Sn1_recno
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
  
  if (!asset.EMPRESA) errors.push('Filial (EMPRESA) é obrigatória.');
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
  console.log(`Enviando dados para Protheus (${apiUrl}):`, protheusData);

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
