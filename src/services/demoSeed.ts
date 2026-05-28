import { Asset } from '../types';

export const getDemoSeedAssets = (): Asset[] => {
  const assets: Asset[] = [];
  const locations = [
    'TI - DATA CENTER',
    'TI - DESENVOLVIMENTO',
    'ADMINISTRAÇÃO - TÉRREO',
    'FINANCEIRO - SALA 12',
    'GALPÃO A - LOGÍSTICA',
    'GALPÃO B - PRODUÇÃO',
    'RECEPÇÃO'
  ];

  const types = [
    { prefix: 'NOTEBOOK', desc: 'NOTEBOOK DELL LATITUDE 5420 INTEL I5 16GB SSD 512GB', conta: '1.02.01.01.03', valorMin: 4500, valorMax: 6200 },
    { prefix: 'MONITOR', desc: 'MONITOR DELL P2422H 23.8" IPS FHD WIDESCREEN', conta: '1.02.01.01.04', valorMin: 1100, valorMax: 1600 },
    { prefix: 'MESA', desc: 'MESA ERGONÔMICA CORRIDA MDF 160X80 CINZA', conta: '1.02.01.01.01', valorMin: 850, valorMax: 1200 },
    { prefix: 'CADEIRA', desc: 'CADEIRA ERGONÔMICA NR17 PRETA COM BRAÇOS REGULÁVEIS', conta: '1.02.01.01.02', valorMin: 950, valorMax: 1400 },
    { prefix: 'AR-CONDICIONADO', desc: 'AR CONDICIONADO SPLIT HW CARRIER SENSITIVE 22000 BTUS ECO', conta: '1.02.01.01.05', valorMin: 3200, valorMax: 4800 },
    { prefix: 'SERVIDOR', desc: 'SERVIDOR DELL POWEREDGE R750 INTEL XEON 64GB', conta: '1.02.01.01.03', valorMin: 22000, valorMax: 38000 },
    { prefix: 'SWITCH', desc: 'SWITCH CISCO CATALYST 24 PORTAS POE GIGABIT', conta: '1.02.01.01.03', valorMin: 8500, valorMax: 12500 },
    { prefix: 'IMPRESSORA', desc: 'IMPRESSORA LASER MULTIFUNCIONAL HP LASERJET PRO', conta: '1.02.01.01.04', valorMin: 3400, valorMax: 5400 },
    { prefix: 'EMPILHADEIRA', desc: 'EMPILHADEIRA MANUAL HIDRÁULICA REFORÇADA 1500KG', conta: '1.02.01.01.08', valorMin: 18500, valorMax: 26000 },
    { prefix: 'COMPRESSOR', desc: 'COMPRESSOR DE AR INDUSTRIAL SCHULZ 15 PES 175 PSI', conta: '1.02.01.01.08', valorMin: 6500, valorMax: 9200 },
  ];

  for (let i = 1; i <= 52; i++) {
    const loc = locations[i % locations.length];
    const t = types[i % types.length];
    const itemNum = 100000 + i;
    const value = parseFloat((Math.random() * (t.valorMax - t.valorMin) + t.valorMin).toFixed(2));
    
    // Some are checked to make the dashboard look interesting immediately
    const isChecked = i % 4 === 0;

    assets.push({
      id: `DEMO_ASSET_${itemNum}`,
      ETIQUETA: `DEMO${i.toString().padStart(4, '0')}`,
      REGISTRO: `${itemNum}`,
      DESCRICAODOATIVO: `${t.desc} (#${i})`,
      VLRAQUISIC: value,
      DATAAQUISIC: `2024-0${(i % 9) + 1}-15`,
      CENTRODECUSTO: loc.split(' - ')[0],
      conta_contabil: t.conta,
      TAG_INVENTARIO: isChecked ? `OK_${itemNum}` : '',
      ESTADO_CONSERVACAO: i % 5 === 0 ? 'REGULAR' : i % 8 === 0 ? 'RUIM' : 'BOM',
      GRUPO_EMPRESARIAL: 'CICOPAL',
      UNIDADE_OPERACIONAL: 'MATRIZ',
      UNIDADE: 'MATRIZ',
      QT: 1,
      SERIAL: `SN_DEMO_${itemNum}_BR`,
      CNPJ: '12.345.678/0001-99',
      NOMEFORNECEDOR: 'PROVEDORES E FABRICANTES DEMO BRASIL LTDA',
      NOTAFISCAL: `NF-${20000 + i}`,
      ENDERECO: loc,
      tenantId: 'DEMO_DEFAULT',
      filial: 'MATRIZ',
      _tenantid: 'DEMO_DEFAULT',
      _unitid: 'MATRIZ',
      _unidade: 'MATRIZ',
      _conferido: isChecked,
      _localMaster: loc,
      _lastUpdated: new Date().toISOString(),
      _dataLeitura: isChecked ? new Date().toISOString().split('T')[0] : '',
      _auditor: isChecked ? 'Auditor Demo' : '',
      _photoUrl: '',
      latitude: -16.68 + (Math.random() - 0.5) * 0.05,
      longitude: -49.25 + (Math.random() - 0.5) * 0.05,
      currentCampaignId: 'CAMPAGN_DEMO',
      _version: 1,
      _is_deleted: false,
      _plaquetado: i % 3 !== 0,
      _plaquetaMaster: '',
      _descricaoMaster: '',
      _aprovado: isChecked,
      _dataAprovacao: isChecked ? new Date().toISOString() : '',
      _aprovador: isChecked ? 'SISTEMA DEMO' : '',
      _assinatura: '',
      _isNew: false,
      _is_unitized: false,
      _is_divergent_baixa: false,
      Sn1_recno: 1000 + i,
      Sn3_recno: 5000 + i,
      DE_PARA: '',
      AUDITOR_STATUS_CONFERENCIA: isChecked ? 'CONFERIDO_BOM' : 'PENDENTE',
      _origemTransacao: 1,
      _parent_id: '',
      _is_synced: false,
      _altitude_metros: 750,
      _id_andar: 'TÉRREO',
      STATUS: 'ATIVO',
      DATABAIXA: ''
    });
  }

  return assets;
};
