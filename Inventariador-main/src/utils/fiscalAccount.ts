// ============================================================================
// Conta contábil de eliminação fiscal (131105001)
// ----------------------------------------------------------------------------
// O ERP entrega o campo `contacontabil` com a conta CONCATENADA com o nome:
// `131105001PROJETOSEMANDAMENTO`, `131102001EQUIPAMENTOSDETELEFONIA`. Comparar
// com igualdade (`=== '131105001'`) nunca casa — nem o corte antigo de envio
// nem a reparação dos registos encontravam uma única linha real.
//
// A detecção passa a ser por PREFIXO, num único lugar, para os sítios que
// ainda distinguem esta conta (reparação de envio e filtro da ficha do ativo).
// ============================================================================

/** Início do código da conta de eliminação fiscal. */
export const FISCAL_ACCOUNT_PREFIX = '131105001';

/** `contacontabil` pertence à conta 131105001 (com ou sem nome concatenado)? */
export const isFiscalAccount = (conta: unknown): boolean =>
  String(conta ?? '').trim().startsWith(FISCAL_ACCOUNT_PREFIX);
