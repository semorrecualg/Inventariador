/**
 * Contrato efetivo para as consultas locais: perfil → sessão → armazenamento.
 *
 * O dono global (`ADMIN`) NÃO declara `tenantid` no perfil: se a leitura parasse
 * no utilizador, todas as consultas `[tenantid+filial]` (endereços, localidades,
 * estatísticas) rodavam com contrato vazio e devolviam «Nenhum Endereço
 * Cadastrado» mesmo com a base carregada. A cadeia é a mesma de
 * `resolveTenantId` (utils/tenantUtils) usada no resto do app.
 *
 * Vive num util (e não em `localDbService`) para o `sqliteService` o poder usar
 * ao carimbar a trilha de auditoria — `localDbService` importa `sqliteService`,
 * e a importação inversa fechava um ciclo.
 */
export const getCurrentTenantid = (): string => {
  const candidatos: string[] = [];
  try {
    const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      candidatos.push(
        String(user?.tenantid || user?.tenantId || user?.tenant_id || user?.tenantid_ || '')
      );
    }
  } catch { /* ignore */ }
  try {
    candidatos.push(sessionStorage.getItem('tenantid') || '', sessionStorage.getItem('tenantId') || '');
  } catch { /* ignore */ }
  try {
    candidatos.push(localStorage.getItem('tenantid') || '', localStorage.getItem('tenantId') || '');
  } catch { /* ignore */ }

  const valido = candidatos
    .map(c => c.trim())
    .find(c => c !== '' && !['NULL', 'UNDEFINED', 'N/A'].includes(c.toUpperCase()));
  return valido || '';
};
