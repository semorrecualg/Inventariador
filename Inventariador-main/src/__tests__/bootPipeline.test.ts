// @vitest-environment jsdom
// ============================================================================
// bootPipeline.test.ts — decide o arranque antes do React montar.
//
// Cobre o que regrediu antes:
//  1. Uma sessão local (credencial do app) sobrevive ao arranque — era apagada
//     incondicionalmente.
//  2. Um perfil da nuvem sem token válido (fantasma) continua a ser purgado.
//  3. A cópia persistida é reposta ANTES da decisão: sem isso, um separador
//     novo era tratado como «sem sessão» antes de a cópia ser lida.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { InitializeBootPipeline } from '../App';
import { writePersistedSession } from '../utils/sessionPersistence';

const ADMIN = {
  username: 'semorr',
  email: 'semorr@gmail.com',
  name: 'Administrador',
  role: 'ADMIN',
  tenantid: 'CICOPAL',
  filial: 'TODAS'
};

const CLOUD_GHOST = {
  username: 'auditor',
  email: 'auditor@example.com',
  name: 'Auditor',
  role: 'AUDITOR',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO'
};

const history = (): string[] => {
  const raw = localStorage.getItem('gbr_kardek_history');
  return raw ? (JSON.parse(raw) as string[]) : [];
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('InitializeBootPipeline', () => {
  it('mantém a sessão local e não força o login', () => {
    sessionStorage.setItem('app_current_user', JSON.stringify(ADMIN));
    sessionStorage.setItem('tenantid', 'CICOPAL');
    localStorage.setItem('gbr_kardek_history', JSON.stringify(['WORK_CONTEXT_SELECTION']));

    InitializeBootPipeline();

    expect(JSON.parse(sessionStorage.getItem('app_current_user') || '{}').email).toBe('semorr@gmail.com');
    expect(sessionStorage.getItem('tenantid')).toBe('CICOPAL');
    expect(history()).toEqual(['WORK_CONTEXT_SELECTION']);
  });

  it('purga o fantasma da nuvem e volta ao login', () => {
    sessionStorage.setItem('app_current_user', JSON.stringify(CLOUD_GHOST));
    sessionStorage.setItem('tenantid', 'CICOPAL');
    localStorage.setItem('gbr_kardek_history', JSON.stringify(['WORK_CONTEXT_SELECTION']));

    InitializeBootPipeline();

    expect(sessionStorage.getItem('app_current_user')).toBeNull();
    expect(sessionStorage.getItem('tenantid')).toBeNull();
    expect(history()).toEqual(['LOGIN']);
  });

  it('repõe a cópia persistida antes de decidir (separador novo não é fantasma)', () => {
    // Estado de um separador novo: só a cópia em localStorage, dentro do prazo.
    writePersistedSession(ADMIN as never, Date.now());
    localStorage.setItem('gbr_kardek_history', JSON.stringify(['WORK_CONTEXT_SELECTION']));

    InitializeBootPipeline();

    expect(JSON.parse(sessionStorage.getItem('app_current_user') || '{}').email).toBe('semorr@gmail.com');
    expect(sessionStorage.getItem('gbr_session_origin')).toBe('APP');
    expect(sessionStorage.getItem('tenantid')).toBe('CICOPAL');
    // A decisão viu a sessão: não reescreveu o histórico para LOGIN.
    expect(history()).toEqual(['WORK_CONTEXT_SELECTION']);
  });
});
