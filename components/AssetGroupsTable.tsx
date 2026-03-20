import React, { useState, useMemo } from 'react';
import { AssetGroup, DepreciationMethod } from '../types';
import { Plus, Edit2, Trash2, Save, X, Search, BookOpen } from 'lucide-react';

interface AssetGroupsTableProps {
  groups: AssetGroup[];
  onSave: (group: Partial<AssetGroup>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const AssetGroupsTable: React.FC<AssetGroupsTableProps> = ({ 
  groups, 
  onSave, 
  onDelete
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AssetGroup>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleStartEdit = (group: AssetGroup) => {
    setEditingId(group.id);
    setEditForm(group);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!editForm.name || !editForm.group_code || !editForm.asset_account) {
      alert('Preencha os campos obrigatórios (Grupo, Descrição e Conta Ativo)');
      return;
    }
    await onSave(editForm);
    handleCancel();
  };

  const filteredGroups = useMemo(() => {
    return groups.filter(g => 
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.group_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.asset_account.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groups, searchTerm]);

  const methodLabels: Record<DepreciationMethod, string> = {
    [DepreciationMethod.LINEAR]: 'Linear',
    [DepreciationMethod.ACCELERATED_SUM_DIGITS]: 'Acel. (Soma Dígitos)',
    [DepreciationMethod.ACCELERATED_DECLINING_BALANCE]: 'Acel. (Saldo Decr.)',
    [DepreciationMethod.UNITS_OF_PRODUCTION]: 'Unid. Produção'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text"
            placeholder="Buscar por nome, grupo ou conta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditForm({
              group_code: '',
              name: '',
              asset_account: '',
              accumulated_depreciation_account: '',
              depreciation_expense_account: '',
              annual_depreciation_rate: 10,
              depreciation_method: DepreciationMethod.LINEAR,
              useful_life_months: 120
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Grupo</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupo (4)</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conta Ativo</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Depr. Acum.</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desp. Depr.</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Taxa (%)</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método</th>
              <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isAdding && (
              <tr className="bg-emerald-50/30">
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    maxLength={4}
                    value={editForm.group_code || ''}
                    onChange={(e) => setEditForm({...editForm, group_code: e.target.value.replace(/\D/g, '')})}
                    className="w-16 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="0000"
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="Ex: MÓVEIS E UTENSÍLIOS"
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.asset_account || ''}
                    onChange={(e) => setEditForm({...editForm, asset_account: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="Conta Ativo"
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.accumulated_depreciation_account || ''}
                    onChange={(e) => setEditForm({...editForm, accumulated_depreciation_account: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="Conta Acum."
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.depreciation_expense_account || ''}
                    onChange={(e) => setEditForm({...editForm, depreciation_expense_account: e.target.value})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                    placeholder="Conta Desp."
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="number"
                    value={editForm.annual_depreciation_rate || ''}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      setEditForm({
                        ...editForm, 
                        annual_depreciation_rate: rate,
                        useful_life_months: rate > 0 ? Math.round(1200 / rate) : 0
                      });
                    }}
                    className="w-16 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={editForm.depreciation_method || DepreciationMethod.LINEAR}
                    onChange={(e) => setEditForm({...editForm, depreciation_method: e.target.value as DepreciationMethod})}
                    className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm bg-white"
                  >
                    {Object.entries(methodLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filteredGroups.map(group => (
              <tr key={group.id} className="hover:bg-slate-50 transition-colors">
                {editingId === group.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        maxLength={4}
                        value={editForm.group_code || ''}
                        onChange={(e) => setEditForm({...editForm, group_code: e.target.value.replace(/\D/g, '')})}
                        className="w-16 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.asset_account || ''}
                        onChange={(e) => setEditForm({...editForm, asset_account: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.accumulated_depreciation_account || ''}
                        onChange={(e) => setEditForm({...editForm, accumulated_depreciation_account: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.depreciation_expense_account || ''}
                        onChange={(e) => setEditForm({...editForm, depreciation_expense_account: e.target.value})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        value={editForm.annual_depreciation_rate || ''}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          setEditForm({
                            ...editForm, 
                            annual_depreciation_rate: rate,
                            useful_life_months: rate > 0 ? Math.round(1200 / rate) : 0
                          });
                        }}
                        className="w-16 px-2 py-1 border border-emerald-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editForm.depreciation_method || DepreciationMethod.LINEAR}
                        onChange={(e) => setEditForm({...editForm, depreciation_method: e.target.value as DepreciationMethod})}
                        className="w-full px-2 py-1 border border-emerald-200 rounded-lg text-sm bg-white"
                      >
                        {Object.entries(methodLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                        {group.group_code}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-700">{group.name}</td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">{group.asset_account}</td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">{group.accumulated_depreciation_account || '----'}</td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">{group.depreciation_expense_account || '----'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 font-bold">{group.annual_depreciation_rate}%</td>
                    <td className="px-4 py-4">
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">
                        {methodLabels[group.depreciation_method]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleStartEdit(group)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => onDelete(group.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-slate-400 mt-0.5" />
          <div className="text-xs text-slate-500 leading-relaxed">
            <p className="font-bold text-slate-600 mb-1">Sobre os Métodos de Depreciação:</p>
            <p><strong>Linear:</strong> Alocação uniforme do custo ao longo da vida útil.</p>
            <p><strong>Acelerada:</strong> Maior perda de valor nos primeiros anos (Soma dos Dígitos ou Saldo Decrescente).</p>
            <p><strong>Unidades de Produção:</strong> Baseado no uso efetivo do ativo.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetGroupsTable;
