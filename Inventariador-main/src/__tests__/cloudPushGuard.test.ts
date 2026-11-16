import { describe, it, expect } from 'vitest';
import {
  auditCloudPush,
  checkCloudPushGuard,
  findIdentityConflicts,
  formatCloudPushAudit,
  formatCloudPushIdentityConflicts,
  nextCloudPushBlockedBackoff,
  CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS,
  CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS
} from '../utils/cloudPushGuard';
import { assetIdentityKey, type DedupRow } from '../utils/dedupAssets';

const row = (over: Partial<DedupRow> & { primarykey: string }): DedupRow => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  etiqueta: '007222',
  _conferido: 0,
  _is_synced: 0,
  ...over
});

/**
 * A guarda existe porque a nuvem é consolidada (uma linha por tenantid +
 * filial + etiqueta) e um envio de aparelho com 12 636 linhas recria as
 * 1 195 cópias para todos os dispositivos.
 */
describe('cloudPushGuard — bloqueio do envio da base local para a nuvem', () => {
  it('libera o envio quando a base tem uma linha por identidade', () => {
    const rows = [
      row({ primarykey: 'A' }),
      row({ primarykey: 'B', etiqueta: '007223' }),
      row({ primarykey: 'C', tenantid: 'CARPER', filial: '010401 CARPER BA' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.message).toEqual([]);
    expect(guard.audit).toMatchObject({ total: 3, identities: 3, groupsWithCopies: 0, copies: 0 });
  });

  it('bloqueia quando duas linhas partilham tenantid + filial + etiqueta', () => {
    const rows = [
      row({ primarykey: 'A' }),
      row({ primarykey: 'B' }),
      row({ primarykey: 'C', etiqueta: '007223' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(true);
    expect(guard.audit).toMatchObject({ total: 3, identities: 2, groupsWithCopies: 1, copies: 1 });
    const texto = guard.message.join(' | ');
    expect(texto).toContain('ENVIO BLOQUEADO');
    expect(texto).toContain('1 cópia(s) repetida(s) em 1 grupo(s)');
    expect(texto).toContain('3 linhas para 2 ativos distintos');
    expect(texto).toContain('LIMPAR CÓPIAS');
  });

  it('conta várias cópias do mesmo grupo e mostra o total de linhas', () => {
    const rows = [
      row({ primarykey: 'A' }),
      row({ primarykey: 'B' }),
      row({ primarykey: 'C' }),
      row({ primarykey: 'D', etiqueta: '007223' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(true);
    expect(guard.audit.identities).toBe(2);
    expect(guard.audit.copies).toBe(2);
    expect(guard.audit.groupsWithCopies).toBe(1);
    expect(guard.message[0]).toContain('2 cópia(s) repetida(s)');
  });

  it('normaliza filial/etiqueta/tenantid como a limpeza (caixa, acentos, hífen, espaços)', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'cicopal', filial: '010101 CICOPAL GO', etiqueta: '007222' }),
      row({ primarykey: 'B', tenantid: ' CICOPAL ', filial: '010101  cicopal-go ', etiqueta: ' 007222 ' })
    ];

    expect(checkCloudPushGuard(rows).blocked).toBe(true);
    expect(auditCloudPush(rows).identities).toBe(1);
  });

  it('não considera cópia a mesma etiqueta em contrato diferente', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'CICOPAL' }),
      row({ primarykey: 'B', tenantid: 'CARPER' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.audit.identities).toBe(2);
  });

  it('não bloqueia por linhas sem etiqueta (não têm identidade)', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: '' }),
      row({ primarykey: 'B', etiqueta: undefined }),
      row({ primarykey: 'C', etiqueta: '007222' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.audit.withoutIdentity).toBe(2);
    expect(guard.audit.identities).toBe(1);
  });

  it('discrimina os números por filial, como o relatório da limpeza', () => {
    const rows = [
      row({ primarykey: 'A', filial: '010101 CICOPAL GO', etiqueta: '0001' }),
      row({ primarykey: 'B', filial: '010101 CICOPAL GO', etiqueta: '0002' }),
      row({ primarykey: 'C', filial: '010101 CICOPAL GO', etiqueta: '0002' }),
      row({ primarykey: 'D', filial: '010401 CARPER BA', etiqueta: '0003' })
    ];

    const audit = auditCloudPush(rows);
    expect(audit.perFilial).toHaveLength(2);
    expect(audit.perFilial[0]).toMatchObject({
      filial: '010101 CICOPAL GO',
      rows: 3,
      identities: 2,
      copies: 1
    });
    expect(audit.perFilial[1]).toMatchObject({
      filial: '010401 CARPER BA',
      rows: 1,
      identities: 1,
      copies: 0
    });
  });

  it('não trata placeholders como identidade (filhos de unitarização)', () => {
    expect(assetIdentityKey(row({ primarykey: 'U1', etiqueta: 'ETIQUETAR' }))).toBe('');
    expect(assetIdentityKey(row({ primarykey: 'U2', etiqueta: ' sem etiqueta ' }))).toBe('');
    expect(assetIdentityKey(row({ primarykey: 'U3', etiqueta: '0' }))).toBe('');
    expect(assetIdentityKey(row({ primarykey: 'U4', etiqueta: 'S/N' }))).toBe('');
  });

  it('deixa passar o payload da unitarização (filhos ainda com ETIQUETAR)', () => {
    const rows = [
      row({ primarykey: 'PAI', etiqueta: '007222' }),
      row({ primarykey: 'U1', etiqueta: 'ETIQUETAR' }),
      row({ primarykey: 'U2', etiqueta: 'ETIQUETAR' }),
      row({ primarykey: 'U3', etiqueta: 'ETIQUETAR' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.audit.identities).toBe(1);
    expect(guard.audit.withoutIdentity).toBe(3);
  });

  it('deteta a linha cuja identidade já está na nuvem com outro primarykey', () => {
    const payload = [row({ primarykey: 'COPIA-LOCAL', etiqueta: '007222' }) ];
    const cloud = [row({ primarykey: 'KEEPER-NUVEM', etiqueta: '007222' })];

    const conflicts = findIdentityConflicts(payload, cloud);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ attempted: 'COPIA-LOCAL', existing: ['KEEPER-NUVEM'] });
    expect(formatCloudPushIdentityConflicts(conflicts)[0]).toContain('ENVIO BLOQUEADO: 1 ativo(s)');
  });

  it('não acusa conflito quando o primarykey enviado é o mesmo da nuvem', () => {
    const payload = [row({ primarykey: 'A' })];
    const cloud = [row({ primarykey: 'A' })];

    expect(findIdentityConflicts(payload, cloud)).toEqual([]);
  });

  it('compara a identidade normalizada e separa contratos', () => {
    const payload = [
      row({ primarykey: 'A', tenantid: 'cicopal', filial: '010101  cicopal-go', etiqueta: ' 007222 ' })
    ];
    // Mesma identidade, outra grafia → conflito.
    expect(
      findIdentityConflicts(payload, [row({ primarykey: 'B', filial: '010101 CICOPAL GO' })])
    ).toHaveLength(1);
    // Outro contrato → sem conflito.
    expect(findIdentityConflicts(payload, [row({ primarykey: 'B', tenantid: 'CARPER' })])).toEqual([]);
  });

  it('ignora linhas sem etiqueta (não têm identidade)', () => {
    const payload = [row({ primarykey: 'A', etiqueta: '' })];
    const cloud = [row({ primarykey: 'B', etiqueta: '' })];

    expect(findIdentityConflicts(payload, cloud)).toEqual([]);
  });

  it('lista todos os primarykeys que a nuvem já tem para a identidade', () => {
    const payload = [row({ primarykey: 'NOVO' })];
    const cloud = [row({ primarykey: 'X' }), row({ primarykey: 'Y' })];

    const conflicts = findIdentityConflicts(payload, cloud);
    expect(conflicts[0].existing.sort()).toEqual(['X', 'Y']);
  });

  it('formata o mesmo texto que a guarda devolve (fonte única do aviso)', () => {
    const guard = checkCloudPushGuard([row({ primarykey: 'A' }), row({ primarykey: 'B' })]);

    expect(formatCloudPushAudit(guard.audit)).toEqual(guard.message);
    // Base limpa: sem aviso nenhum.
    expect(formatCloudPushAudit(checkCloudPushGuard([row({ primarykey: 'A' })]).audit)).toEqual([]);
  });

  it('recua o envio bloqueado: começa em 30 s, dobra e para no teto de 5 min', () => {
    expect(nextCloudPushBlockedBackoff(0)).toBe(CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS);
    expect(nextCloudPushBlockedBackoff(CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS)).toBe(60000);
    expect(nextCloudPushBlockedBackoff(60000)).toBe(120000);
    expect(nextCloudPushBlockedBackoff(120000)).toBe(240000);
    expect(nextCloudPushBlockedBackoff(240000)).toBe(CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS);
    expect(nextCloudPushBlockedBackoff(CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS)).toBe(
      CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS
    );
  });

  it('reproduz o incidente real: 12 636 linhas / 11 441 identidades bloqueiam o envio', () => {
    const rows: DedupRow[] = [];
    // 11 441 identidades = 10 784 ativos únicos + 657 grupos com cópias.
    for (let i = 0; i < 10784; i += 1) {
      rows.push(row({ primarykey: `S${i}`, etiqueta: `E${i}` }));
    }
    // 538 grupos com 3 cópias + 119 com 2 = 657 grupos e 1 195 linhas a mais.
    for (let g = 0; g < 538; g += 1) {
      for (let c = 0; c < 3; c += 1) rows.push(row({ primarykey: `T${g}-${c}`, etiqueta: `T${g}` }));
    }
    for (let g = 0; g < 119; g += 1) {
      for (let c = 0; c < 2; c += 1) rows.push(row({ primarykey: `D${g}-${c}`, etiqueta: `D${g}` }));
    }

    const guard = checkCloudPushGuard(rows);
    expect(rows).toHaveLength(12636);
    expect(guard.blocked).toBe(true);
    expect(guard.audit).toMatchObject({
      total: 12636,
      identities: 11441,
      groupsWithCopies: 657,
      copies: 1195
    });
    expect(guard.message[0]).toContain('1195 cópia(s) repetida(s) em 657 grupo(s)');
  });
});
