// A recusa do envio era gravada com `table_name: 'local_assets'` e não estava
// na lista de ações de ativo: a causa de um «Pendente Nuvem» eterno caía no
// separador «Sistema», em cinzento, longe do ativo a que diz respeito.
import { describe, it, expect } from 'vitest';
import { getActionColor, isAssetLog } from '../utils/auditActions';

describe('trilha de auditoria — falha de envio na aba Ativos', () => {
  it.each(['SYNC_RECORD_FAIL', 'SYNC_RECORD_EXCEPTION'])(
    'classifica %s como registo de ativo',
    (acao) => {
      expect(isAssetLog({ action: acao, table_name: 'local_assets' })).toBe(true);
    }
  );

  it('mantém as ações de sistema fora da aba Ativos', () => {
    expect(isAssetLog({ action: 'LOGIN', table_name: 'sessions' })).toBe(false);
    expect(isAssetLog({ action: 'SYNC_PUSH', table_name: 'system' })).toBe(false);
  });

  it('pinta a falha de envio de vermelho', () => {
    expect(getActionColor('SYNC_RECORD_FAIL')).toContain('text-red-700');
    expect(getActionColor('SYNC_RECORD_EXCEPTION')).toContain('bg-red-100');
  });

  it('não muda a cor das ações que já existiam', () => {
    expect(getActionColor('UPDATE')).toContain('text-blue-700');
    expect(getActionColor('DELETE')).toContain('text-red-700');
  });
});
