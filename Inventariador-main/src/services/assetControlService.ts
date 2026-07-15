
import { supabase } from './supabaseService';
import { AssetGroup, AssetMovement, DepreciationHistory, Asset, ChartOfAccount, NCMClassifier } from '../types';

export const assetControlService = {
  // Plano de Contas
  async getChartOfAccounts(tenantid: string | string[]): Promise<ChartOfAccount[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    let query = supabase.from('chart_of_accounts').select('*');
    
    if (Array.isArray(tenantid)) {
      query = query.in('tenantId', tenantid);
    } else {
      query = query.eq('tenantId', tenantid);
    }
    
    const { data, error } = await query.order('code', { ascending: true });
    
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
  async getAssetGroups(tenantid: string | string[]): Promise<AssetGroup[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    let query = supabase.from('asset_groups').select('*');
    
    if (Array.isArray(tenantid)) {
      query = query.in('tenantId', tenantid);
    } else {
      query = query.eq('tenantId', tenantid);
    }
    
    const { data, error } = await query;
    
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
  async getNCMClassifiers(tenantid: string | string[]): Promise<NCMClassifier[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    let query = supabase.from('ncm_classifiers').select('*');
    
    if (Array.isArray(tenantid)) {
      query = query.in('tenantId', tenantid);
    } else {
      query = query.eq('tenantId', tenantid);
    }
    
    const { data, error } = await query;
    
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

  // Normalização de Unidades Operacionais
  async normalizeUnits(tenantid: string): Promise<{ discovered: number, created: number }> {
    if (!supabase) throw new Error("Supabase não configurado.");

    // 1. Buscar todas as unidades únicas presentes nos ativos
    const { data: assetUnits, error: assetError } = await supabase
      .from('assets')
      .select('filial')
      .eq('tenantId', tenantid)
      .not('filial', 'is', null);

    if (assetError) throw assetError;

    const uniqueUnitsFromAssets = Array.from(new Set(assetUnits.map(a => a.filial?.trim()).filter(Boolean)));

    // 2. Buscar unidades já configuradas
    const { data: existingConfigs, error: configError } = await supabase
      .from('unit_configs')
      .select('_unitid')
      .eq('tenantId', tenantid);

    if (configError) throw configError;

    const existingUnitNames = new Set(existingConfigs.map(c => c._unitid?.trim()));

    // 3. Identificar unidades não configuradas
    const unitsToCreate = uniqueUnitsFromAssets.filter(u => !existingUnitNames.has(u));

    if (unitsToCreate.length === 0) return { discovered: uniqueUnitsFromAssets.length, created: 0 };

    // 4. Criar configurações básicas para as novas unidades
    const newConfigs = unitsToCreate.map(unit => ({
      tenantId: tenantid,
      _unitid: unit,
      unit_id: unit,
      filial: unit,
      lat: -15.7942, // Default Brasília
      lng: -47.8822,
      radius_meters: 500,
      is_active: true,
      updated_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('unit_configs')
      .insert(newConfigs);

    if (insertError) throw insertError;

    return { discovered: uniqueUnitsFromAssets.length, created: unitsToCreate.length };
  },

  async getNCMClassifierByCode(ncmCode: string, tenantid: string | string[]): Promise<NCMClassifier | null> {
    if (!supabase) throw new Error("Supabase não configurado.");
    let query = supabase.from('ncm_classifiers').select('*').eq('ncm_code', ncmCode);
    
    if (Array.isArray(tenantid)) {
      query = query.in('tenantId', tenantid);
    } else {
      query = query.eq('tenantId', tenantid);
    }
    
    const { data, error } = await query.single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
    return data;
  },

  // Movimentações
  async getMovements(assetId: string, tenantid: string): Promise<AssetMovement[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('asset_movements')
      .select('*')
      .eq('asset_id', assetId)
      .eq('tenantId', tenantid)
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
  async getDepreciationHistory(assetId: string, tenantid: string): Promise<DepreciationHistory[]> {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('asset_depreciation_history')
      .select('*')
      .eq('asset_id', assetId)
      .eq('tenantId', tenantid)
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
