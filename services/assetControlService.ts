
import { supabase } from './supabaseService';
import { AssetGroup, AssetMovement, DepreciationHistory, Asset, ChartOfAccount, NCMClassifier } from '../types';

export const assetControlService = {
  // Plano de Contas
  async getChartOfAccounts(tenantId: string): Promise<ChartOfAccount[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('_tenantId', tenantId)
      .order('code', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async saveChartOfAccount(account: Partial<ChartOfAccount>): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('chart_of_accounts')
      .upsert(account);
    
    if (error) throw error;
  },

  async deleteChartOfAccount(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Grupos Contábeis (Bens)
  async getAssetGroups(tenantId: string): Promise<AssetGroup[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('asset_groups')
      .select('*')
      .eq('_tenantId', tenantId);
    
    if (error) throw error;
    return data || [];
  },

  async saveAssetGroup(group: Partial<AssetGroup>): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('asset_groups')
      .upsert(group);
    
    if (error) throw error;
  },

  async deleteAssetGroup(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('asset_groups')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Classificador NCM
  async getNCMClassifiers(tenantId: string): Promise<NCMClassifier[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('ncm_classifiers')
      .select('*')
      .eq('_tenantId', tenantId);
    
    if (error) throw error;
    return data || [];
  },

  async saveNCMClassifier(classifier: Partial<NCMClassifier>): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('ncm_classifiers')
      .upsert(classifier);
    
    if (error) throw error;
  },

  async deleteNCMClassifier(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('ncm_classifiers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  async getNCMClassifierByCode(ncmCode: string, tenantId: string): Promise<NCMClassifier | null> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('ncm_classifiers')
      .select('*')
      .eq('ncm_code', ncmCode)
      .eq('_tenantId', tenantId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
    return data;
  },

  // Movimentações
  async getMovements(assetId: string, tenantId: string): Promise<AssetMovement[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('asset_movements')
      .select('*')
      .eq('asset_id', assetId)
      .eq('_tenantId', tenantId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async recordMovement(movement: Partial<AssetMovement>): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('asset_movements')
      .insert(movement);
    
    if (error) throw error;
  },

  // Depreciação
  async getDepreciationHistory(assetId: string, tenantId: string): Promise<DepreciationHistory[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('asset_depreciation_history')
      .select('*')
      .eq('asset_id', assetId)
      .eq('_tenantId', tenantId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  // Cálculo de Depreciação (Lógica de Negócio)
  calculateDepreciation(asset: Asset, targetMonth: number, targetYear: number): number {
    if (!asset._valor_aquisicao || !asset._taxa_depreciacao_anual || !asset._data_inicio_depreciacao) {
      return 0;
    }

    const startDate = new Date(asset._data_inicio_depreciacao);
    const targetDate = new Date(targetYear, targetMonth - 1, 1);

    if (targetDate < startDate) return 0;

    // Cálculo linear simples: (Valor Aquisicao * Taxa Anual / 100) / 12
    const monthlyRate = (asset._taxa_depreciacao_anual / 100) / 12;
    const monthlyValue = asset._valor_aquisicao * monthlyRate;

    // Verificar se já atingiu o valor residual (se houver)
    const residual = asset._valor_residual || 0;
    const maxDepreciation = asset._valor_aquisicao - residual;
    
    // Aqui poderíamos calcular a acumulada para travar no residual
    // Mas para o cálculo mensal individual, retornamos o valor padrão
    return Math.min(monthlyValue, maxDepreciation);
  }
};
