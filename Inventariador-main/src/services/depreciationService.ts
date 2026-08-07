
import { Asset } from '../types';

/**
 * GBR Depreciation Engine - Conformidade CPC 27 / IAS 16
 * Realiza cálculos de quotas, depreciação acumulada e VCL.
 */

export interface DepreciationResult {
  monthlyQuota: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthsElapsed: number;
  isFullyDepreciated: boolean;
}

/**
 * Calcula a depreciação de um ativo com base no método linear (pro-rata temporis).
 */
export const calculateDepreciation = (asset: Asset, referenceDate: Date = new Date()): DepreciationResult => {
  const v0 = Number(asset._valor_aquisicao || asset.vlraquisic || 0);
  const vr = Number(asset._valor_residual || 0);
  const n = Number(asset._vida_util_meses || 60); // Default 5 anos
  const startDateStr = asset._data_inicio_depreciacao || asset._data_aquisicao || String(asset.dataaqusic ?? '');

  if (!startDateStr || v0 <= 0) {
    return {
      monthlyQuota: 0,
      accumulatedDepreciation: 0,
      netBookValue: v0,
      monthsElapsed: 0,
      isFullyDepreciated: false
    };
  }

  const startDate = new Date(startDateStr);
  
  // Cálculo de meses decorridos (pro-rata temporis)
  let monthsElapsed = (referenceDate.getFullYear() - startDate.getFullYear()) * 12;
  monthsElapsed += referenceDate.getMonth() - startDate.getMonth();
  
  // Se o dia da data de referência for menor que o dia de início, o mês atual ainda não "contou" totalmente
  // Mas para fins contábeis simplificados, costuma-se usar o mês cheio ou pro-rata dias.
  // Aqui usaremos pro-rata mensal simples.
  if (monthsElapsed < 0) monthsElapsed = 0;

  const depreciableAmount = v0 - vr;
  const monthlyQuota = depreciableAmount / n;
  
  let accumulatedDepreciation = monthlyQuota * monthsElapsed;
  
  // Limite da depreciação ao valor depreciável
  if (accumulatedDepreciation > depreciableAmount) {
    accumulatedDepreciation = depreciableAmount;
  }

  const netBookValue = v0 - accumulatedDepreciation;
  const isFullyDepreciated = accumulatedDepreciation >= depreciableAmount;

  return {
    monthlyQuota,
    accumulatedDepreciation,
    netBookValue,
    monthsElapsed,
    isFullyDepreciated
  };
};

/**
 * Gera a projeção de depreciação (Ficha do Ativo)
 */
export const generateDepreciationSchedule = (asset: Asset) => {
  const schedule = [];
  const v0 = Number(asset._valor_aquisicao || asset.vlraquisic || 0);
  const n = Number(asset._vida_util_meses || 60);
  const startDateStr = asset._data_inicio_depreciacao || asset._data_aquisicao || String(asset.dataaqusic ?? '');

  if (!startDateStr) return [];

  const startDate = new Date(startDateStr);
  const { monthlyQuota } = calculateDepreciation(asset);

  for (let i = 0; i <= n; i++) {
    const currentDate = new Date(startDate);
    currentDate.setMonth(startDate.getMonth() + i);
    
    const accDepr = Math.min(monthlyQuota * i, v0 - Number(asset._valor_residual || 0));
    
    schedule.push({
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear(),
      quota: i === 0 ? 0 : monthlyQuota,
      accumulated: accDepr,
      vcl: v0 - accDepr
    });

    if (accDepr >= (v0 - Number(asset._valor_residual || 0))) break;
  }

  return schedule;
};
