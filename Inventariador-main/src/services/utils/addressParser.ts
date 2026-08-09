export interface RawAddressInput {
  tenantId?: string | null;
  tenantid?: string | null;
  filial?: string | null;
  codigo_endereco?: string | null;
  setor?: string | null;
  bloco?: string | null;
}

export function parseAndSanitizeAddress(input: RawAddressInput) {
  const cleanStr = (val: unknown): string => String(val ?? '').trim().toUpperCase();
  return {
    tenantid: cleanStr(input.tenantid ?? input.tenantId) || '',
    filial: cleanStr(input.filial) || '',
    codigo_endereco: cleanStr(input.codigo_endereco).replace(/[^A-Z0-9-]/g, ''), // Filtra sujeiras do Excel
    setor: cleanStr(input.setor) || 'GERAL',
    bloco: cleanStr(input.bloco) || 'A',
    _is_synced: 1
  };
}
