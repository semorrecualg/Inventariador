// src/__tests__/tagService.test.ts
// Regras de Ouro das TAGS de auditoria — conferência física (docs/TELA_INVENTARIO.md § 2.5).
import { describe, it, expect } from 'vitest';
import { Asset, TagInventario } from '../types';
import { determineAssetTag, resolvePersistedTag, getTagMetadata } from '../services/tagService';

const asset = (patch: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  etiqueta: '000123',
  descricaodoativo: 'CADEIRA',
  status: 'ATIVO',
  filial: 'MATRIZ',
  endereco: 'CORREDOR A',
  ...patch
} as Asset);

describe('determineAssetTag — Regras de Ouro', () => {
  it('ativo no endereço original é PENDENTE antes da conferência', () => {
    expect(determineAssetTag(asset(), 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.PENDENTE);
  });

  it('ativo conferido no endereço original é CONFERIDO', () => {
    expect(determineAssetTag(asset({ _conferido: true }), 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.CONFERIDO);
  });

  it('ativo conferido em outro endereço é ADOTADO', () => {
    expect(determineAssetTag(asset({ _conferido: true }), 'CORREDOR B', 'MATRIZ')).toBe(TagInventario.ADOTADO);
  });

  it('reconferido em novo local é RE-ADOTADO', () => {
    const moved = asset({ _conferido: true, _localMaster: 'CORREDOR B' });
    expect(determineAssetTag(moved, 'CORREDOR C', 'MATRIZ')).toBe(TagInventario.RE_ADOTADO);
  });

  it('BAIXADO é permanente: continua BAIXADO mesmo conferido e localizado', () => {
    const baixado = asset({ status: 'BAIXA', databaixa: '01/01/2025', _conferido: true });
    expect(determineAssetTag(baixado, 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.BAIXADO);
  });

  it('ativo com data de baixa é DIVERGÊNCIA crítica (regra de ouro)', () => {
    expect(determineAssetTag(asset({ databaixa: '01/01/2025' }), 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.DIVERGENCIA);
  });

  it('registro de outra empresa é ADOTADO EXTERNO', () => {
    expect(determineAssetTag(asset(), 'CORREDOR A', 'FILIAL-2')).toBe(TagInventario.ADOTADO_EXTERNO);
  });

  it('novo item permanece NOVO ITEM mesmo conferido', () => {
    expect(determineAssetTag(asset({ _isNew: true, _conferido: true }), 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.NOVO_ITEM);
  });
});

describe('determineAssetTag — emplaquetamento (FALTA ETIQUETAR × ETIQUETADO)', () => {
  const needsLabel = asset({ _plaquetaMaster: 'ETIQUETAR' });

  it('instrução "ETIQUETAR" na plaqueta mestre é FALTA ETIQUETAR', () => {
    expect(determineAssetTag(needsLabel, 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.FALTA_ETIQUETAR);
  });

  it('conferir o bem NÃO conclui o emplaquetamento', () => {
    expect(determineAssetTag({ ...needsLabel, _conferido: true }, 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.FALTA_ETIQUETAR);
  });

  it('plaqueta física "ETIQUETAR" (base sem _plaquetaMaster) também é FALTA ETIQUETAR', () => {
    expect(determineAssetTag(asset({ etiqueta: 'ETIQUETAR', _conferido: true }), 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.FALTA_ETIQUETAR);
  });

  it('_plaquetado confirma a etiquetagem → ETIQUETADO', () => {
    expect(determineAssetTag({ ...needsLabel, _conferido: true, _plaquetado: true }, 'CORREDOR B', 'MATRIZ')).toBe(TagInventario.ETIQUETADO);
  });

  it('tag ETIQUETADO gravada é preservada mesmo sem o flag', () => {
    expect(determineAssetTag({ ...needsLabel, TAG_INVENTARIO: TagInventario.ETIQUETADO }, 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.ETIQUETADO);
  });

  it('BAIXADO continua a vencer o emplaquetamento', () => {
    expect(determineAssetTag({ ...needsLabel, status: 'BAIXA', _plaquetado: true }, 'CORREDOR A', 'MATRIZ')).toBe(TagInventario.BAIXADO);
  });
});

describe('resolvePersistedTag — tags de decisão são preservadas', () => {
  it('preserva RE-ADOTADO gravado mesmo com _localMaster já atualizado', () => {
    const moved = asset({ _conferido: true, _localMaster: 'CORREDOR B', TAG_INVENTARIO: TagInventario.RE_ADOTADO });
    expect(resolvePersistedTag(moved, 'CORREDOR B', 'MATRIZ')).toBe(TagInventario.RE_ADOTADO);
  });

  it('recalcula quando a tag gravada não é uma decisão (ex.: CONFERIDO)', () => {
    const moved = asset({ _conferido: true, TAG_INVENTARIO: TagInventario.CONFERIDO });
    expect(resolvePersistedTag(moved, 'CORREDOR B', 'MATRIZ')).toBe(TagInventario.ADOTADO);
  });
});

describe('TAG_POLICY — cores de alta visibilidade', () => {
  it('BAIXADO usa vermelho crítico e texto legível', () => {
    const meta = getTagMetadata(TagInventario.BAIXADO);
    expect(meta.color.bg).toContain('red-600');
    expect(meta.color.text).toBe('text-white');
  });

  it('NOVO ITEM usa laranja e CONFERIDO verde esmeralda', () => {
    expect(getTagMetadata(TagInventario.NOVO_ITEM).color.bg).toContain('orange');
    expect(getTagMetadata(TagInventario.CONFERIDO).color.bg).toContain('emerald');
  });

  it('FALTA ETIQUETAR é âmbar e ETIQUETADO é violeta (Matriz de Tags)', () => {
    expect(getTagMetadata(TagInventario.FALTA_ETIQUETAR).color.bg).toContain('amber');
    expect(getTagMetadata(TagInventario.ETIQUETADO).color.bg).toContain('violet');
  });
});
