
import React, { useState, useMemo } from 'react';
import { ChartOfAccount, AccountType, AccountNature, AccountClassification } from '../types';
import { Plus, Edit2, Trash2, Save, X, Search } from 'lucide-react';

interface ChartOfAccountsTableProps {
  accounts: ChartOfAccount[];
  onSave: (account: Partial<ChartOfAccount>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ChartOfAccountsTable: React.FC<ChartOfAccountsTableProps> = ({ 
  accounts, 
  onSave, 
  onDelete 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ChartOfAccount>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleStartEdit = (acc: ChartOfAccount) => {
    setEditingId(acc.id);
    setEditForm(acc);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!editForm.code || !editForm.name) {
      alert('Preencha os campos obrigatórios (Código e Nome)');
      return;
    }
    await onSave(editForm);
    handleCancel();
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [accounts, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text"
            placeholder="Buscar por código ou nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditForm({
              code: '',
              name: '',
              type: AccountType.ANALYTICAL,
              level: 1,
              nature: AccountNature.DEBIT,
              classification: AccountClassification.ASSET,
              is_active: true
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Conta</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código (CÓD_CTA)</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição / Nome</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo (IND_CTA)</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nível</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Natureza</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Classificação</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isAdding && (
              <tr className="bg-indigo-50/30">
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.code || ''}
                    onChange={(e) => setEditForm({...editForm, code: e.target.value})}
                    className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                    placeholder="1.1.01.0001"
                  />
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                    placeholder="Nome da Conta"
                  />
                </td>
                <td className="px-4 py-3">
                  <select 
                    value={editForm.type}
                    onChange={(e) => setEditForm({...editForm, type: e.target.value as AccountType})}
                    className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                  >
                    <option value={AccountType.SYNTHETIC}>Sintética</option>
                    <option value={AccountType.ANALYTICAL}>Analítica</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="number"
                    value={editForm.level || 1}
                    onChange={(e) => setEditForm({...editForm, level: Number(e.target.value)})}
                    className="w-16 px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <select 
                    value={editForm.nature}
                    onChange={(e) => setEditForm({...editForm, nature: e.target.value as AccountNature})}
                    className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                  >
                    <option value={AccountNature.DEBIT}>Devedora</option>
                    <option value={AccountNature.CREDIT}>Credora</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select 
                    value={editForm.classification}
                    onChange={(e) => setEditForm({...editForm, classification: e.target.value as AccountClassification})}
                    className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                  >
                    {Object.values(AccountClassification).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button 
                    onClick={() => setEditForm({...editForm, is_active: !editForm.is_active})}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${editForm.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {editForm.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleSave} className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filteredAccounts.map(acc => (
              <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                {editingId === acc.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.code || ''}
                        onChange={(e) => setEditForm({...editForm, code: e.target.value})}
                        className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={editForm.type}
                        onChange={(e) => setEditForm({...editForm, type: e.target.value as AccountType})}
                        className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      >
                        <option value={AccountType.SYNTHETIC}>Sintética</option>
                        <option value={AccountType.ANALYTICAL}>Analítica</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        value={editForm.level || 1}
                        onChange={(e) => setEditForm({...editForm, level: Number(e.target.value)})}
                        className="w-16 px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={editForm.nature}
                        onChange={(e) => setEditForm({...editForm, nature: e.target.value as AccountNature})}
                        className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      >
                        <option value={AccountNature.DEBIT}>Devedora</option>
                        <option value={AccountNature.CREDIT}>Credora</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={editForm.classification}
                        onChange={(e) => setEditForm({...editForm, classification: e.target.value as AccountClassification})}
                        className="w-full px-2 py-1 border border-indigo-200 rounded-lg text-sm"
                      >
                        {Object.values(AccountClassification).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => setEditForm({...editForm, is_active: !editForm.is_active})}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${editForm.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                      >
                        {editForm.is_active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={handleSave} className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">
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
                    <td className="px-4 py-4 text-xs font-mono font-bold text-slate-600">{acc.code}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-slate-700" style={{ paddingLeft: `${(acc.level - 1) * 12}px` }}>
                          {acc.type === AccountType.SYNTHETIC ? (
                            <span className="font-bold">{acc.name}</span>
                          ) : (
                            acc.name
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${acc.type === AccountType.SYNTHETIC ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {acc.type === AccountType.SYNTHETIC ? 'Sintética' : 'Analítica'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500 font-bold">{acc.level}</td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase">
                      {acc.nature === AccountNature.DEBIT ? 'Devedora' : 'Credora'}
                    </td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase">{acc.classification}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${acc.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {acc.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleStartEdit(acc)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => onDelete(acc.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
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
    </div>
  );
};

export default ChartOfAccountsTable;
