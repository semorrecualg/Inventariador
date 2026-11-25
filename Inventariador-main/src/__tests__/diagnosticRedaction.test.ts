import { describe, it, expect } from 'vitest';
import { redactDiagnosticText, redactTenantId } from '../utils/diagnosticRedaction';
import { formatPerfBaseline, type PerfBaseline } from '../utils/perfMetrics';

/**
 * O pacote de diagnóstico circula fora do aparelho (ticket, chat, suporte).
 * Estes testes fixam o contrato da redação: o que identifica pessoas/contratos
 * e o que é credencial nunca sai legível, e o contexto que o suporte usa para
 * correlacionar o incidente continua lá.
 */
describe('redactDiagnosticText — pacote de diagnóstico seguro para partilha', () => {
  describe('e-mails', () => {
    it('mascara a parte local e o nome do domínio, mantendo o sufixo', () => {
      expect(redactDiagnosticText('contato: ana.silva@gbrkardek.com.br')).toBe(
        'contato: a***@g***.com.br'
      );
    });

    it('mantém sufixos compostos e domínios de um só nível', () => {
      expect(redactDiagnosticText('ana@empresa.com')).toBe('a***@e***.com');
      expect(redactDiagnosticText('ana@empresa.co.uk')).toBe('a***@e***.co.uk');
    });
  });

  describe('tenantids/contratos', () => {
    it('mascara o valor em JSON', () => {
      expect(redactDiagnosticText('"tenantid": "GBR001",')).toBe('"tenantid": "GB***",');
    });

    it('mascara o valor em forma chave=valor', () => {
      expect(redactDiagnosticText('tenantid=GBR001')).toBe('tenantid=GB***');
      expect(redactDiagnosticText('contrato: CICOPAL')).toBe('contrato: CI***');
    });

    it('mascara tenantid em texto corrido («contrato GBR001»)', () => {
      expect(redactDiagnosticText('Carga de planilha para o contrato GBR001 concluída')).toBe(
        'Carga de planilha para o contrato GB*** concluída'
      );
      expect(redactDiagnosticText('ver tenant ABC12')).toBe('ver tenant AB***');
      expect(redactDiagnosticText('Contrato (GBR001) sem ativos')).toBe('Contrato (GB***) sem ativos');
    });

    it('não mexe no que é rótulo, só no que identifica o contrato', () => {
      expect(redactDiagnosticText('Contrato Ativo (tenantid): GBR001')).toBe(
        'Contrato Ativo (tenantid): GB***'
      );
      expect(redactDiagnosticText('contrato de serviço sem tenant')).toBe(
        'contrato de serviço sem tenant'
      );
      expect(redactDiagnosticText('Contrato GLOBAL / SEM CONTRATO')).toBe(
        'Contrato GLOBAL / SEM CONTRATO'
      );
    });

    it('não apanha nomes de variáveis que só começam pela palavra-chave', () => {
      expect(redactDiagnosticText('contratosDaCarga: GBR001')).toBe('contratosDaCarga: GBR001');
      expect(redactDiagnosticText('tenantidMap pronto')).toBe('tenantidMap pronto');
    });
  });

  describe('credenciais e tokens', () => {
    it('mascara valores de chaves de credencial', () => {
      expect(redactDiagnosticText('"access_token": "sbp_9f8a7b6c5d4e"')).toBe(
        '"access_token": "***"'
      );
      expect(redactDiagnosticText('api_key=abc12345')).toBe('api_key=***');
    });

    it('mascara Bearer e JWT', () => {
      expect(redactDiagnosticText('Authorization: Bearer abcdefgh12345678')).toBe(
        'Authorization: ***'
      );
      expect(
        redactDiagnosticText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij')
      ).toBe('token [JWT redigido]');
    });
  });

  describe('URLs', () => {
    it('esconde os valores dos parâmetros e mantém host, caminho e nomes', () => {
      expect(redactDiagnosticText('https://host.example.com/x?anonKey=abc&uid=7')).toBe(
        'https://host.example.com/x?anonKey=***&uid=***'
      );
    });

    it('esconde credenciais embutidas na URL', () => {
      expect(redactDiagnosticText('https://user:senha123@app.example.com/api/v1')).toBe(
        'https://***@app.example.com/api/v1'
      );
    });

    it('esconde o fragmento', () => {
      expect(redactDiagnosticText('https://host.example.com/#access_token=abc')).toBe(
        'https://host.example.com/#***'
      );
    });
  });

  describe('identificadores opacos', () => {
    it('mascara UUIDs e hashes longos mantendo um prefixo de correlação', () => {
      expect(redactDiagnosticText('id=3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b')).toBe(
        'id=3f2a1b***'
      );
      expect(
        redactDiagnosticText('hash 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9f8a7b6c')
      ).toBe('hash 9f8a7b***');
    });
  });

  describe('contexto preservado (não redigir demais)', () => {
    it('mantém contagens, métricas e user-agent intactos', () => {
      const text = [
        '## Espelhos (contagens)',
        '- local_assets: 42',
        '- ativos: 42',
        '- assets: 42',
        '- Espelho virtual (sandbox): 0',
        '- boot: 1200ms(p50)/2400ms(p95) n=12',
        '- User-Agent: Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36',
      ].join('\n');
      expect(redactDiagnosticText(text)).toBe(text);
    });

    it('mantém o cabeçalho do pacote e a versão', () => {
      const text = [
        '# Pacote de Diagnóstico — SRE Diagnostics Monitor',
        '- Gerado em: 2026-11-17T00:36:57.123Z',
        '- Versão da app: 2.7.5',
        '- Build: mode=production prod=true dev=false',
      ].join('\n');
      expect(redactDiagnosticText(text)).toBe(text);
    });

    it('texto vazio continua vazio', () => {
      expect(redactDiagnosticText('')).toBe('');
    });
  });

  describe('identificadores isolados', () => {
    it('mascara o tenantid de uma coluna de CSV com a mesma forma do texto', () => {
      expect(redactTenantId('CICOPAL')).toBe('CI***');
      expect(redactTenantId('  gbr001 ')).toBe('GB***');
      expect(redactTenantId('')).toBe('***');
      expect(redactTenantId(null)).toBe('***');
    });
  });

  describe('linha de base F0', () => {
    const baseline: PerfBaseline = {
      at: '2026-11-17T00:36:57.123Z',
      trigger: 'manual',
      tenantid: 'CICOPAL',
      mirrors: { local_assets: 12636, ativos: 12636, assets: 12636, total: 12636 },
      metrics: {
        boot: { samples: 3, p50: 1200, p95: 2400, last: 1300 },
        'pull.full': { samples: 1, p50: 9000, p95: 9000, last: 9000 },
        'pull.delta': { samples: 2, p50: 300, p95: 500, last: 320 },
        push: { samples: 0, p50: null, p95: null, last: null },
        save: { samples: 0, p50: null, p95: null, last: null }
      }
    };

    it('continua a ser JSON válido depois de redigido — dá para colar no ticket', () => {
      const redacted = redactDiagnosticText(formatPerfBaseline(baseline));
      expect(() => JSON.parse(redacted)).not.toThrow();

      const parsed = JSON.parse(redacted) as PerfBaseline;
      expect(parsed.tenantid).toBe('CI***');
      // O contexto que o suporte usa para preencher §6.2.1 fica intacto.
      expect(parsed.at).toBe(baseline.at);
      expect(parsed.trigger).toBe('manual');
      expect(parsed.mirrors).toEqual(baseline.mirrors);
      expect(parsed.metrics).toEqual(baseline.metrics);
    });
  });
});
