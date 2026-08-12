/**
 * POLÍTICA DE SENHA — GBR KARDEK
 *
 * Duas políticas:
 *  - FORTE: obrigatória para o usuário MASTER criado no provisionamento de
 *    licença (novo tenant/cliente) e para papéis de governança (ADMIN/MASTER).
 *  - LEVE: para sub-usuários de "login rápido" (credenciais locais criadas
 *    pelo MASTER, encapsuladas no tenant dele).
 *
 * Funções puras (sem I/O) — testáveis em isolamento.
 */

export interface PasswordPolicyResult {
  valid: boolean;
  /** 0..5 — nº de regras atendidas (para medidor de força na UI). */
  score: number;
  errors: string[];
}

export const STRONG_PASSWORD_MIN_LENGTH = 8;
export const QUICK_LOGIN_MIN_LENGTH = 6;

const STRONG_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `Mínimo de ${STRONG_PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= STRONG_PASSWORD_MIN_LENGTH },
  { label: 'Pelo menos uma letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { label: 'Pelo menos uma letra minúscula', test: (p) => /[a-z]/.test(p) },
  { label: 'Pelo menos um número', test: (p) => /[0-9]/.test(p) },
  { label: 'Pelo menos um caractere especial', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Senha FORTE — exigida para MASTER/ADMIN e provisionamento de licença.
 * Todas as 5 regras devem ser atendidas.
 */
export const validateStrongPassword = (password: string): PasswordPolicyResult => {
  const errors = STRONG_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  return {
    valid: errors.length === 0,
    score: STRONG_RULES.length - errors.length,
    errors,
  };
};

/**
 * Senha LEVE — para sub-usuários de "login rápido": mínimo de caracteres e
 * pelo menos uma letra + um número (evita credenciais triviais).
 */
export const validateQuickLoginPassword = (password: string): PasswordPolicyResult => {
  const errors: string[] = [];
  if (password.length < QUICK_LOGIN_MIN_LENGTH) {
    errors.push(`Mínimo de ${QUICK_LOGIN_MIN_LENGTH} caracteres`);
  }
  if (!/[A-Za-z]/.test(password)) {
    errors.push('Pelo menos uma letra');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Pelo menos um número');
  }
  return {
    valid: errors.length === 0,
    score: 3 - errors.length,
    errors,
  };
};

/** Rótulos das regras da política forte (para exibir o checklist na UI). */
export const STRONG_PASSWORD_RULE_LABELS: string[] = STRONG_RULES.map((r) => r.label);

/** Medidor de força (0..5) para feedback em tempo real na UI. */
export const passwordScore = (password: string): number =>
  STRONG_RULES.filter((r) => r.test(password)).length;
