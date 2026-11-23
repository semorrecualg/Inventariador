// @vitest-environment node
// ============================================================================
// auditLogPontoUnico.test.ts — a trilha tem UM ponto de escrita.
//
// Os escritores chamavam `db.audit_logs.put` à mão e decidiam por si o
// `tenantid` e o estado: os eventos que não passavam pelo `logAuditEvent`
// ficavam sem contrato carimbado (a fila de F2 colava-lhes o contrato activo no
// envio) e sem `new_data` local. Este teste lê o código-fonte e falha se
// aparecer outro escritor directo fora de `services/sqliteService.ts`.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PONTO_UNICO = join('services', 'sqliteService.ts');

const ficheirosFonte = (dir: string): string[] => {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue;
      saida.push(...ficheirosFonte(caminho));
      continue;
    }
    if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith('.d.ts')) saida.push(caminho);
  }
  return saida;
};

const fonteRelativa = (caminho: string) => relative(RAIZ, caminho).split('\\').join('/');
const ler = (caminho: string) => readFileSync(caminho, 'utf8');

describe('trilha de auditoria — ponto único de escrita', () => {
  it('só o sqliteService escreve em `db.audit_logs.put`', () => {
    const escritores = ficheirosFonte(RAIZ)
      .filter((caminho) => fonteRelativa(caminho) !== PONTO_UNICO.split('\\').join('/'))
      .filter((caminho) => /db\.audit_logs\.put\s*\(/.test(ler(caminho)))
      .map(fonteRelativa);

    expect(escritores).toEqual([]);
  });

  it('quem chama `bulkPut`/`bulkAdd` na trilha constrói as linhas pelo ponto único', () => {
    const bulk = ficheirosFonte(RAIZ)
      .filter((caminho) => fonteRelativa(caminho) !== 'services/sqliteService.ts')
      .filter((caminho) => /db\.audit_logs\.bulk(Put|Add)\s*\(/.test(ler(caminho)));

    for (const caminho of bulk) {
      const fonte = ler(caminho);
      expect(
        /construirAuditoria|gravarAuditoria/.test(fonte),
        `${fonteRelativa(caminho)} grava em lote sem passar por construirAuditoria/gravarAuditoria`
      ).toBe(true);
    }
  });

  it('os escritores directos que sobraram passam pelo `gravarAuditoria`', () => {
    const alvos = [
      'components/InventoryCard.tsx',
      'services/DatabaseLoaderService.ts',
      'services/recnoGuardService.ts',
      'services/localDbService.ts'
    ];

    for (const alvo of alvos) {
      const fonte = ler(join(RAIZ, alvo));
      expect(fonte, `${alvo} não usa gravarAuditoria/construirAuditoria`).toMatch(
        /gravarAuditoria|construirAuditoria/
      );
    }
  });
});
