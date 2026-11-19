import { describe, it, expect } from 'vitest';
import {
  auditCloudPush,
  checkCloudPushGuard,
  findDuplicateRecords,
  findIdentityConflicts,
  formatCloudPushIdentityConflicts,
  formatDuplicateRecords,
  formatIdentityCopiesNotice,
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
 * A nuvem guarda uma linha por (tenantid, primarykey). Duas linhas da planilha
 * com a mesma etiqueta são registos distintos e sobem as duas; o que a guarda
 * recusa é o mesmo registo (tenantid + primarykey) repetido no payload, que o
 * upsert por (tenantid, id) não consegue gravar.
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

  it('libera duas linhas da planilha com a mesma etiqueta e primarykeys distintas', () => {
    const rows = [
      row({ primarykey: '01010100000003480050' }),
      row({ primarykey: '01010100000003480051' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.message).toEqual([]);
    expect(guard.audit).toMatchObject({ total: 2, identities: 1, groupsWithCopies: 1, copies: 1 });
    expect(guard.message).not.toContain('ENVIO BLOQUEADO');
  });

  it('bloqueia o mesmo registo (tenantid + primarykey) enviado duas vezes', () => {
    const rows = [row({ primarykey: 'A' }), row({ primarykey: 'A', etiqueta: '007999' })];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(true);
    expect(guard.duplicates).toEqual([{ tenantid: 'CICOPAL', primarykey: 'A', count: 2 }]);
    const texto = guard.message.join(' | ');
    expect(texto).toContain('ENVIO BLOQUEADO');
    expect(texto).toContain('1 linha(s) repetida(s) do mesmo registo em 1 primarykey(s)');
    expect(texto).toContain('primarykey A: 2 linha(s)');
    expect(texto).not.toContain('LIMPAR CÓPIAS');
  });

  it('conta as linhas a mais quando a mesma chave aparece três vezes', () => {
    const rows = [
      row({ primarykey: 'A' }),
      row({ primarykey: 'A' }),
      row({ primarykey: 'A' })
    ];

    expect(findDuplicateRecords(rows)).toEqual([{ tenantid: 'CICOPAL', primarykey: 'A', count: 3 }]);
    expect(checkCloudPushGuard(rows).message[0]).toContain('2 linha(s) repetida(s)');
  });

  it('não trata como repetido o mesmo primarykey em contratos diferentes', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'CICOPAL' }),
      row({ primarykey: 'A', tenantid: 'CARPER' })
    ];

    expect(findDuplicateRecords(rows)).toEqual([]);
    expect(checkCloudPushGuard(rows).blocked).toBe(false);
  });

  it('normaliza a caixa do contrato ao comparar a chave', () => {
    const rows = [row({ primarykey: 'A', tenantid: 'CICOPAL' }), row({ primarykey: 'A', tenantid: ' cicopal ' })];

    expect(findDuplicateRecords(rows)).toEqual([{ tenantid: 'CICOPAL', primarykey: 'A', count: 2 }]);
  });

  it('normaliza filial/etiqueta/tenantid na identidade (caixa, acentos, hífen, espaços)', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'cicopal', filial: '010101 CICOPAL GO', etiqueta: '007222' }),
      row({ primarykey: 'B', tenantid: ' CICOPAL ', filial: '010101  cicopal-go ', etiqueta: ' 007222 ' })
    ];

    expect(checkCloudPushGuard(rows).blocked).toBe(false);
    expect(auditCloudPush(rows).identities).toBe(1);
    expect(auditCloudPush(rows).copies).toBe(1);
  });

  it('não considera a mesma identidade em contrato diferente', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'CICOPAL' }),
      row({ primarykey: 'B', tenantid: 'CARPER' })
    ];

    const guard = checkCloudPushGuard(rows);
    expect(guard.blocked).toBe(false);
    expect(guard.audit.identities).toBe(2);
  });

  it('não agrupa linhas sem etiqueta (não têm identidade)', () => {
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

  it('discrimina os números por filial', () => {
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

  it('formata o aviso informativo das identidades repetidas, uma vez', () => {
    const audit = auditCloudPush([row({ primarykey: 'A' }), row({ primarykey: 'B' })]);
    const linhas = formatIdentityCopiesNotice(audit);

    expect(linhas[0]).toContain('1 linha(s) a mais em 1 grupo(s)');
    expect(linhas[0]).toContain('2 linhas para 1 identidade(s)');
    expect(linhas[1]).toContain('registos distintos da planilha');
    expect(linhas[2]).toContain('010101 CICOPAL GO: 2 linhas · 1 identidade(s) · 1 repetida(s)');
    // Base sem identidades repetidas: nenhum aviso.
    expect(formatIdentityCopiesNotice(auditCloudPush([row({ primarykey: 'A' })]))).toEqual([]);
  });

  it('formata o bloqueio por registo repetido (fonte única)', () => {
    const duplicates = [{ tenantid: 'CICOPAL', primarykey: 'A', count: 2 }];
    expect(formatDuplicateRecords(duplicates)[0]).toContain('ENVIO BLOQUEADO');
    expect(formatDuplicateRecords([])).toEqual([]);
  });

  it('deteta (só para diagnóstico) a linha cuja identidade já está na nuvem', () => {
    const payload = [row({ primarykey: 'SEGUNDA-LINHA', etiqueta: '007222' })];
    const cloud = [row({ primarykey: 'PRIMEIRA-LINHA', etiqueta: '007222' })];

    const conflicts = findIdentityConflicts(payload, cloud);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ attempted: 'SEGUNDA-LINHA', existing: ['PRIMEIRA-LINHA'] });
    expect(formatCloudPushIdentityConflicts(conflicts)[0]).toContain('seguem como registos distintos');
  });

  it('não acusa conflito quando o primarykey enviado é o mesmo da nuvem', () => {
    expect(findIdentityConflicts([row({ primarykey: 'A' })], [row({ primarykey: 'A' })])).toEqual([]);
  });

  it('compara a identidade normalizada e separa contratos', () => {
    const payload = [
      row({ primarykey: 'A', tenantid: 'cicopal', filial: '010101  cicopal-go', etiqueta: ' 007222 ' })
    ];
    expect(
      findIdentityConflicts(payload, [row({ primarykey: 'B', filial: '010101 CICOPAL GO' })])
    ).toHaveLength(1);
    expect(findIdentityConflicts(payload, [row({ primarykey: 'B', tenantid: 'CARPER' })])).toEqual([]);
  });

  it('ignora linhas sem etiqueta no diagnóstico de identidade', () => {
    const payload = [row({ primarykey: 'A', etiqueta: '' })];
    const cloud = [row({ primarykey: 'B', etiqueta: '' })];

    expect(findIdentityConflicts(payload, cloud)).toEqual([]);
  });

  it('lista todos os primarykeys que a nuvem já tem para a identidade', () => {
    const conflicts = findIdentityConflicts([row({ primarykey: 'NOVO' })], [
      row({ primarykey: 'X' }),
      row({ primarykey: 'Y' })
    ]);
    expect(conflicts[0].existing.sort()).toEqual(['X', 'Y']);
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

  it('reproduz a base real: 12 636 linhas / 11 437 identidades sobem', () => {
    const rows: DedupRow[] = [];
    // 654 grupos com identidade repetida: 150 com 3 linhas + 504 com 2 = 804 a mais.
    for (let g = 0; g < 150; g += 1) {
      for (let c = 0; c < 3; c += 1) rows.push(row({ primarykey: `T${g}-${c}`, etiqueta: `T${g}` }));
    }
    for (let g = 0; g < 504; g += 1) {
      for (let c = 0; c < 2; c += 1) rows.push(row({ primarykey: `D${g}-${c}`, etiqueta: `D${g}` }));
    }
    // 11 437 identidades - 654 grupos = 10 783 linhas únicas.
    for (let i = 0; i < 10783; i += 1) rows.push(row({ primarykey: `S${i}`, etiqueta: `E${i}` }));
    // 395 linhas sem etiqueta utilizável (fora do agrupamento, continuam a subir).
    for (let i = 0; i < 395; i += 1) rows.push(row({ primarykey: `X${i}`, etiqueta: '' }));

    const guard = checkCloudPushGuard(rows);
    expect(rows).toHaveLength(12636);
    expect(guard.blocked).toBe(false);
    expect(guard.duplicates).toEqual([]);
    expect(guard.audit).toMatchObject({
      total: 12636,
      identities: 11437,
      groupsWithCopies: 654,
      copies: 804,
      withoutIdentity: 395
    });
  });
});
