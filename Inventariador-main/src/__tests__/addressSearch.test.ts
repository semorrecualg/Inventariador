// @vitest-environment jsdom
// src/__tests__/addressSearch.test.ts
// Busca do ENDEREÇO FÍSICO (AddressSelector) e do filtro de localidade do
// inventário. Bug real: `getLocationsWithStats` filtrava com `startsWith`
// case-sensitive e, no fallback (tabela `addresses` vazia), comparava o
// endereço em MAIÚSCULAS com o termo em minúsculas — digitar "CONTAB" e
// pressionar Enter devolvia "Nenhum Endereço Cadastrado".
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCurrentTenantid,
  localDb,
  matchesAddressSearch,
  normalizeAddressSearch,
  normalizeUnitMatchKey
} from '../services/localDbService';
import { db } from '../services/sqliteService';

describe('busca de endereço/localidade', () => {
  it('encontra o termo em qualquer posição do endereço (não só no início)', () => {
    expect(matchesAddressSearch('151200 CONTABILIDADE - CDC 70104', 'CONTAB')).toBe(true);
    expect(matchesAddressSearch('151200 CONTABILIDADE - CDC 70104', 'contab')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1 MILHO', 'PRODUCAO')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1 MILHO', 'PV1')).toBe(true);
  });

  it('ignora acentos nos dois lados', () => {
    expect(matchesAddressSearch('151200 CONTABILIDADE', 'contabilidade')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUÇÃO - PV1', 'producao')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1', 'produção')).toBe(true);
    expect(matchesAddressSearch('ADMINISTRAÇÃO CENTRAL', 'administracao')).toBe(true);
  });

  it('não casa endereço diferente', () => {
    expect(matchesAddressSearch('151100 PRODUCAO - PV1', 'CONTAB')).toBe(false);
    expect(matchesAddressSearch('', 'CONTAB')).toBe(false);
  });

  it('termo vazio não filtra e espaços extras são normalizados', () => {
    expect(matchesAddressSearch('QUALQUER ENDEREÇO', '')).toBe(true);
    expect(matchesAddressSearch('QUALQUER ENDEREÇO', '   ')).toBe(true);
    expect(matchesAddressSearch('151200 CONTABILIDADE', '  contab  ')).toBe(true);
    expect(normalizeAddressSearch('  151200   CONTABILIDADE  ')).toBe('151200 CONTABILIDADE');
  });
});

describe('getLocationsWithStats — a tabela de trabalho do modo INTERNAL conta', () => {
  // Bug real (figuras): contrato CICOPAL ativo, filial LIBERADA, e o ENDEREÇO
  // FÍSICO dizia «Nenhum Endereço Cadastrado». A leitura cobria `addresses`,
  // `assets` e `local_assets` mas ignorava `ativos` — a tabela em que o modo
  // INTERNAL guarda os ativos (é a que o Dashboard, a Consulta e o Mapa leem).
  const row = (endereco: string, conferido: number, primarykey: string): Record<string, unknown> => ({
    tenantid: 'CICOPAL',
    primarykey,
    id: primarykey,
    filial: '010101_CICOPAL_GO',
    endereco,
    _is_deleted: 0,
    _conferido: conferido
  });
  /** As linhas destes testes são recortes: a tabela exige o resto em produção. */
  const putAtivos = (rows: Array<Record<string, unknown>>) =>
    db.ativos.bulkPut(rows as unknown as Parameters<typeof db.ativos.bulkPut>[0]);
  // A.3a.1: a união passou a ser `ativos` + `local_assets`; `assets` saiu das
  // leituras. As linhas «de outra cópia» destes testes vão para o baseline.
  const putLocal = (rows: Array<Record<string, unknown>>) =>
    db.local_assets.bulkPut(rows as unknown as Parameters<typeof db.local_assets.bulkPut>[0]);
  const putAddresses = (rows: Array<Record<string, unknown>>) =>
    db.addresses.bulkPut(rows as unknown as Parameters<typeof db.addresses.bulkPut>[0]);
  const address = (codigo_endereco: string) => ({
    tenantid: 'CICOPAL',
    filial: '010101_CICOPAL_GO',
    codigo_endereco,
    setor: '',
    bloco: '',
    _is_synced: 1
  });

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('tenantid', 'CICOPAL');
    await db.addresses.clear();
    await db.local_assets.clear();
    await db.ativos.clear();
  });

  it('lista as localidades quando os ativos só existem em `ativos`', async () => {
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      row('151100 PRODUCAO - PV1 MILHO', 1, 'K2'),
      row('151200 CONTABILIDADE - CDC 70104', 0, 'K3'),
      row('', 0, 'K4')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    // «SEM LOCAL» tem 1 pendente (K4): fica no topo, onde o auditor o encontra.
    expect(rows.map(r => r.displayName)).toEqual([
      'SEM LOCAL',
      '151100 PRODUCAO - PV1 MILHO',
      '151200 CONTABILIDADE - CDC 70104'
    ]);
    expect(rows.find(r => r.displayName.startsWith('151100'))).toMatchObject({ total: 2, checked: 1 });
    // K4 não tem coluna de endereço: ganha entrada própria. antes ficava invisível.
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 1, checked: 0 });
  });

  it('junta as duas tabelas de trabalho: `local_assets` e `ativos` contribuem para a lista', async () => {
    await putLocal([
      { tenantid: 'CICOPAL', primarykey: 'A1', id: 'A1', filial: '010101_CICOPAL_GO', endereco: 'ADMINISTRACAO CENTRAL', _is_deleted: 0, _conferido: 0 }
    ]);
    await putAtivos([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual([
      '151100 PRODUCAO - PV1 MILHO',
      'ADMINISTRACAO CENTRAL'
    ]);
  });

  it('cenário misto: `local_assets` com linhas SEM endereço e as localidades em `ativos`', async () => {
    // Regressão real: parar na primeira tabela não vazia deixava este caso
    // vazio — `local_assets` tem a filial, mas nenhuma das linhas tem localidade.
    await putLocal([
      { tenantid: 'CICOPAL', primarykey: 'A1', id: 'A1', filial: '010101_CICOPAL_GO', endereco: '', _is_deleted: 0, _conferido: 0 },
      { tenantid: 'CICOPAL', primarykey: 'A2', id: 'A2', filial: '010101_CICOPAL_GO', _is_deleted: 0, _conferido: 0 }
    ]);
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      row('151200 CONTABILIDADE - CDC 70104', 1, 'K2')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    // «SEM LOCAL» tem 2 pendentes: vai para o topo da lista.
    expect(rows.map(r => r.displayName)).toEqual([
      'SEM LOCAL',
      '151100 PRODUCAO - PV1 MILHO',
      '151200 CONTABILIDADE - CDC 70104'
    ]);
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 2 });
    // A chave interna de contagem nunca vira nome de localidade.
    expect(rows.some(r => r.displayName === 'GERAL - NÃO ESPECIFICADO')).toBe(false);
  });

  it('o mesmo ativo espelhado nas duas tabelas conta UMA vez', async () => {
    const shared = row('151100 PRODUCAO - PV1 MILHO', 0, 'K1');
    await putAtivos([{ ...shared }]);
    await db.local_assets.bulkPut([{ ...shared }] as unknown as Parameters<typeof db.local_assets.bulkPut>[0]);
    await putAtivos([row('151200 CONTABILIDADE - CDC 70104', 0, 'K2')]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.find(r => r.displayName.startsWith('151100'))).toMatchObject({ total: 1, checked: 0 });
    expect(rows.find(r => r.displayName.startsWith('151200'))).toMatchObject({ total: 1 });
  });

  it('`_is_deleted`: a tabela VIVA (`ativos`) manda — vivo nela vence baixado na canónica', async () => {
    await putAtivos([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]); // vivo
    await putLocal([{ ...row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'), _is_deleted: 1 }]); // baixado

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 1, checked: 0 });
  });

  it('`_is_deleted`: baixa feita na tabela viva esconde o ativo mesmo com a canónica viva', async () => {
    await putAtivos([{ ...row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'), _is_deleted: 1 }]); // baixado
    await putLocal([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]); // vivo

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    // A localidade continua listável (é o endereço que dá acesso ao cadastro),
    // mas o ativo baixado não entra nas contagens.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 0, checked: 0 });
  });

  it('`_is_deleted`: sem o campo na tabela viva, desce para o baseline', async () => {
    const semFlag = row('151100 PRODUCAO - PV1 MILHO', 0, 'K1');
    delete semFlag._is_deleted;
    await putAtivos([semFlag]);
    await putLocal([{ ...row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'), _is_deleted: 1 }]);

    const comBaixaNoBaseline = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');
    expect(comBaixaNoBaseline[0]).toMatchObject({ total: 0 });

    await db.local_assets.clear();
    await putLocal([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]); // baseline vivo

    const comBaselineVivo = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');
    expect(comBaselineVivo[0]).toMatchObject({ total: 1 });
  });

  it('conferência feita só numa das cópias conta como conferida', async () => {
    // O trabalho de campo grava em `ativos`; o baseline `local_assets` pode
    // ficar atrás. A união não pode desfazer a conferência já feita.
    await putLocal([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]);
    await putAtivos([row('151100 PRODUCAO - PV1 MILHO', 1, 'K1')]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 1, checked: 1 });
  });

  it('acha a filial gravada com `_` a partir do cartão com espaços (ativos)', async () => {
    await putAtivos([row('151100 PRODUCAO - PV1 MILHO', 0, 'K1')]);

    const rows = await localDb.assets.getLocationsWithStats('010101 cicopal go');

    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('151100 PRODUCAO - PV1 MILHO');
  });

  it('usa o endereço efetivo: `_localMaster` e colunas legadas contam', async () => {
    // Mesma regra do inventário (`assetAddressKey`): o local auditado vence o
    // endereço da base e `LOCALIZACAO`/`CENTRO_CUSTO` também são localidade.
    await putAtivos([
      { ...row('', 0, 'K1'), LOCALIZACAO: 'ALMOXARIFADO CENTRAL' },
      { ...row('', 0, 'K2'), _localMaster: '151300 MANUTENCAO' },
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K3')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual([
      '151100 PRODUCAO - PV1 MILHO',
      '151300 MANUTENCAO',
      'ALMOXARIFADO CENTRAL'
    ]);
  });

  it('sem nenhuma coluna de endereço, oferece «SEM LOCAL» para abrir a lista/cadastro', async () => {
    await putAtivos([
      row('', 0, 'K1'),
      row('', 1, 'K2')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: 'SEM LOCAL', total: 2, checked: 1 });
    // Mesma chave do inventário (`assetAddressKey` → 'SEM LOCAL').
    expect(rows[0].locKey).toBe('SEMLOCAL');
  });

  it('«SEM LOCAL» respeita o termo de busca digitado', async () => {
    await putAtivos([row('', 0, 'K1')]);

    expect(await localDb.assets.getLocationsWithStats('010101 CICOPAL GO', 'CONTAB')).toHaveLength(0);
    expect(await localDb.assets.getLocationsWithStats('010101 CICOPAL GO', 'sem local')).toHaveLength(1);
  });

  it('cenário misto: filial COM localidades e ativos sem endereço abre «SEM LOCAL»', async () => {
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      row('', 0, 'K2'),
      row('', 1, 'K3')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual([
      'SEM LOCAL',
      '151100 PRODUCAO - PV1 MILHO'
    ]);
    expect(rows.find(r => r.displayName === '151100 PRODUCAO - PV1 MILHO')).toMatchObject({ total: 1 });
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 2, checked: 1 });
  });

  it('cenário misto real: localidades no índice `addresses` e ativos sem endereço no baseline', async () => {
    // Formato de produção: o índice tem as localidades da filial e os ativos
    // sem coluna de endereço vivem no baseline. Sem a entrada sintética, estes
    // ativos não tinham caminho nenhum a partir do ecrã.
    await putAddresses([
      address('151100 PRODUCAO - PV1 MILHO'),
      address('151200 CONTABILIDADE - CDC 70104')
    ]);
    await putLocal([
      { tenantid: 'CICOPAL', primarykey: 'A1', id: 'A1', filial: '010101_CICOPAL_GO', _is_deleted: 0, _conferido: 0 },
      { tenantid: 'CICOPAL', primarykey: 'A2', id: 'A2', filial: '010101_CICOPAL_GO', endereco: '', _is_deleted: 0, _conferido: 1 }
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual([
      'SEM LOCAL',
      '151100 PRODUCAO - PV1 MILHO',
      '151200 CONTABILIDADE - CDC 70104'
    ]);
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 2, checked: 1, locKey: 'SEMLOCAL' });
    // A busca continua a achar os dois ativos sem endereço.
    const filtradas = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO', 'sem local');
    expect(filtradas.map(r => r.displayName)).toEqual(['SEM LOCAL']);
  });

  it('cenário misto entre tabelas: localidades no índice e sem endereço só em `ativos`', async () => {
    await putAddresses([address('151100 PRODUCAO - PV1 MILHO')]);
    await putAtivos([row('', 0, 'K1'), row('', 1, 'K2')]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual(['SEM LOCAL', '151100 PRODUCAO - PV1 MILHO']);
    expect(rows.find(r => r.displayName === '151100 PRODUCAO - PV1 MILHO')).toMatchObject({ total: 0 });
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 2, checked: 1 });
  });

  it('linha do índice com endereço vazio não vira «GERAL - NÃO ESPECIFICADO» nem duplica «SEM LOCAL»', async () => {
    await putAddresses([address('')]);
    await putLocal([
      { tenantid: 'CICOPAL', primarykey: 'A1', id: 'A1', filial: '010101_CICOPAL_GO', _is_deleted: 0, _conferido: 0 }
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    // Uma única porta para os ativos sem endereço, com a contagem certa.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: 'SEM LOCAL', total: 1, checked: 0 });
    expect(rows.some(r => r.displayName === 'GERAL - NÃO ESPECIFICADO')).toBe(false);
  });

  it('não duplica «SEM LOCAL» quando já existe uma localidade com esse nome', async () => {
    await putAtivos([
      row('SEM LOCAL', 0, 'K1'),
      row('', 0, 'K2')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    const semLocal = rows.filter(r => r.displayName === 'SEM LOCAL');
    expect(semLocal).toHaveLength(1);
    // A localidade real e os ativos sem endereço são a MESMA chave no inventário.
    expect(semLocal[0]).toMatchObject({ total: 2 });
  });

  it('fixa «SEM LOCAL» no topo enquanto tem itens por conferir', async () => {
    // Numa filial com 150 localidades a ordenação alfabética deixava a entrada
    // no fim: a correcção do #97 (a entrada existir) não resolvia o alcance.
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      row('151200 CONTABILIDADE - CDC 70104', 0, 'K2'),
      row('151300 MANUTENCAO', 0, 'K3'),
      row('', 0, 'K4')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows[0]).toMatchObject({ displayName: 'SEM LOCAL', total: 1, checked: 0 });
    // As restantes continuam alfabéticas.
    expect(rows.slice(1).map(r => r.displayName)).toEqual([
      '151100 PRODUCAO - PV1 MILHO',
      '151200 CONTABILIDADE - CDC 70104',
      '151300 MANUTENCAO'
    ]);
  });

  it('sem pendentes em «SEM LOCAL», a ordem volta a ser alfabética', async () => {
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      row('', 1, 'K2')
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual(['151100 PRODUCAO - PV1 MILHO', 'SEM LOCAL']);
  });

  it('não mistura o mesmo código de filial de outro contrato', async () => {
    await putAtivos([
      row('151100 PRODUCAO - PV1 MILHO', 0, 'K1'),
      { ...row('OUTRO CONTRATO', 0, 'X1'), tenantid: 'OUTRO_TENANT' }
    ]);

    const rows = await localDb.assets.getLocationsWithStats('010101 CICOPAL GO');

    expect(rows.map(r => r.displayName)).toEqual(['151100 PRODUCAO - PV1 MILHO']);
  });
});

describe('filial e contrato da tela de endereço', () => {
  it('trata a mesma filial com espaço, `_`, `-`, caixa e acentos', () => {
    const chave = normalizeUnitMatchKey('010101 CICOPAL GO');
    expect(normalizeUnitMatchKey('010101_CICOPAL_GO')).toBe(chave);
    expect(normalizeUnitMatchKey('010101-Cicopal-Go')).toBe(chave);
    expect(normalizeUnitMatchKey('  010101   CICOPAL   GO  ')).toBe(chave);
    expect(normalizeUnitMatchKey('010101 CICÓPAL GO')).toBe(chave);
    expect(normalizeUnitMatchKey('010201 SNACKS PA')).not.toBe(chave);
  });

  it('resolve o contrato pelo perfil, pela sessão ou pelo armazenamento', () => {
    // Regressão: o dono global não declara tenantid no perfil. A leitura
    // parava no utilizador, o contrato ia vazio para as consultas
    // [tenantid+filial] e o ecrã dizia «Nenhum Endereço Cadastrado».
    sessionStorage.clear();
    localStorage.removeItem('tenantid');
    localStorage.removeItem('tenantId');
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'admin@x.com', role: 'ADMIN' }));
    expect(getCurrentTenantid()).toBe('');

    sessionStorage.setItem('tenantid', 'CICOPAL');
    expect(getCurrentTenantid()).toBe('CICOPAL');

    // Contrato no perfil vence a sessão.
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'a@b.com', tenantid: 'DEMO_DEFAULT' }));
    expect(getCurrentTenantid()).toBe('DEMO_DEFAULT');

    // Valores sentinela não são contrato.
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'a@b.com', tenantid: 'NULL' }));
    sessionStorage.setItem('tenantid', 'UNDEFINED');
    localStorage.setItem('tenantid', 'CICOPAL');
    expect(getCurrentTenantid()).toBe('CICOPAL');

    sessionStorage.clear();
    localStorage.removeItem('tenantid');
  });
});
