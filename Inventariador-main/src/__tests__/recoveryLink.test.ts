// @vitest-environment jsdom
// ============================================================================
// recoveryLink.test.ts — o link de recuperação tem de chegar à app no APK.
//
// No nativo o origin é `https://localhost`, que nenhum browser abre: o e-mail
// apontava para lá e a senha nunca era trocada. O deep link `com.gbr.kardek://`
// resolve isso, e estes testes fixam as duas metades: o destino e os tokens.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  ESQUEMA_RECUPERACAO,
  tokensDoLinkDeRecuperacao,
  urlDeRecuperacao
} from '../utils/recoveryLink';

describe('urlDeRecuperacao', () => {
  it('no nativo usa o esquema próprio da app', () => {
    expect(urlDeRecuperacao(true)).toBe('com.gbr.kardek://recovery');
    expect(ESQUEMA_RECUPERACAO).toBe('com.gbr.kardek://recovery');
  });

  it('na web continua a ser o origin da aplicação', () => {
    expect(urlDeRecuperacao(false)).toMatch(/^https?:\/\//);
    expect(urlDeRecuperacao(false)).not.toContain('com.gbr.kardek://');
  });
});

describe('tokensDoLinkDeRecuperacao', () => {
  it('extrai os tokens do hash do deep link', () => {
    const url =
      'com.gbr.kardek://recovery#access_token=AAA&expires_in=3600&refresh_token=RRR&token_type=bearer&type=recovery';
    expect(tokensDoLinkDeRecuperacao(url)).toEqual({ accessToken: 'AAA', refreshToken: 'RRR' });
  });

  it('aceita também o link web do Supabase', () => {
    const url = 'https://app.exemplo.com/#access_token=AAA&refresh_token=RRR&type=recovery';
    expect(tokensDoLinkDeRecuperacao(url)).toEqual({ accessToken: 'AAA', refreshToken: 'RRR' });
  });

  it('recusa links que não são de recuperação', () => {
    expect(
      tokensDoLinkDeRecuperacao('https://app.exemplo.com/#access_token=AAA&refresh_token=RRR&type=magiclink')
    ).toBeNull();
    expect(tokensDoLinkDeRecuperacao('https://app.exemplo.com/#type=recovery')).toBeNull();
  });

  it('sem refresh_token não há sessão renovável', () => {
    expect(
      tokensDoLinkDeRecuperacao('com.gbr.kardek://recovery#access_token=AAA&type=recovery')
    ).toBeNull();
  });

  it('sem hash ou vazio não devolve nada', () => {
    expect(tokensDoLinkDeRecuperacao('')).toBeNull();
    expect(tokensDoLinkDeRecuperacao(undefined)).toBeNull();
    expect(tokensDoLinkDeRecuperacao('com.gbr.kardek://recovery')).toBeNull();
  });
});
