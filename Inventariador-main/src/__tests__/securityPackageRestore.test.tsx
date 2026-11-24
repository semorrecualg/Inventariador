// @vitest-environment jsdom
// src/__tests__/securityPackageRestore.test.tsx
// F7 (2/2) — ECRÃ DE RESTAURO DO PACOTE DE BACKUP.
//
// Cobre o contrato do `SecurityPackageRestore`:
//  - pacote íntegro → relatório de verificação e restauro só depois de confirmar;
//  - pacote adulterado → recusado no relatório, botão de restauro ausente e a
//    base-alvo intacta (o portão é o `verifySecurityExport`, não a UI);
//  - ficheiro que não é JSON → recusado na leitura, sem tocar na base.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import Dexie from 'dexie';
import { render, screen, fireEvent } from '@testing-library/react';
import { SecurityPackageRestore } from '../components/SecurityPackageRestore';
import { buildSecurityExport, type SecurityExportManifest } from '../services/securityExportService';

const DB_PREFIX = 'SecurityPackageRestoreTest';
let counter = 0;

function makeDb(name: string): Dexie {
  const d = new Dexie(name);
  d.version(1).stores({
    assets_test: 'primarykey',
    config_test: 'key'
  });
  return d;
}

const fileInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

const upload = (container: HTMLElement, file: File) => {
  fireEvent.change(fileInput(container), { target: { files: [file] } });
};

describe('SecurityPackageRestore — restauro do pacote verificado (F7 2/2)', () => {
  it('mostra o relatório e restaura um pacote íntegro só depois da confirmação', async () => {
    const src = makeDb(`${DB_PREFIX}_src_${++counter}`);
    const dst = makeDb(`${DB_PREFIX}_dst_${++counter}`);
    await src.open();
    await dst.open();
    try {
      await src.table('assets_test').bulkAdd([
        { primarykey: 'A-001', filial: 'F1' },
        { primarykey: 'B-002', filial: 'F1' }
      ]);
      await src.table('config_test').put({ key: 'k', value: 'v' });
      await dst.table('assets_test').put({ primarykey: 'ANTIGO', filial: 'STALE' });

      const manifest = await buildSecurityExport(src);
      const onRestored = vi.fn();
      const { container } = render(<SecurityPackageRestore dbInstance={dst} onRestored={onRestored} />);

      upload(container, new File([JSON.stringify(manifest)], 'pacote.json', { type: 'application/json' }));

      expect(await screen.findByText(/Hash verificado/)).toBeTruthy();
      expect(screen.getByText(/3 registos/)).toBeTruthy();
      expect(screen.getByText('assets_test: 2 registo(s)')).toBeTruthy();
      // Nada foi escrito ainda: o relatório vem antes do restauro.
      expect((await dst.table('assets_test').toArray()).map(r => r.primarykey)).toEqual(['ANTIGO']);

      fireEvent.click(screen.getByRole('button', { name: /RESTAURAR PACOTE/ }));
      fireEvent.click(await screen.findByRole('button', { name: /CONFIRMAR RESTAURO/ }));

      expect(await screen.findByText(/Pacote restaurado: 3 registos/)).toBeTruthy();
      expect(onRestored).toHaveBeenCalledTimes(1);
      expect(onRestored.mock.calls[0][0].total).toBe(3);

      const rows = await dst.table('assets_test').toArray();
      expect(rows.map(r => r.primarykey).sort()).toEqual(['A-001', 'B-002']);
      expect(await dst.table('config_test').count()).toBe(1);
    } finally {
      await src.delete();
      await dst.delete();
    }
  });

  it('recusa um pacote adulterado no relatório e não toca na base-alvo', async () => {
    const src = makeDb(`${DB_PREFIX}_tamper_src_${++counter}`);
    const dst = makeDb(`${DB_PREFIX}_tamper_dst_${++counter}`);
    await src.open();
    await dst.open();
    try {
      await src.table('assets_test').bulkAdd([{ primarykey: 'A-001', filial: 'F1', status: 'ATIVO' }]);
      await dst.table('assets_test').put({ primarykey: 'INTACTO', filial: 'ORIGINAL' });

      const manifest = await buildSecurityExport(src);
      const adulterado = JSON.parse(JSON.stringify(manifest)) as SecurityExportManifest;
      (adulterado.tables.assets_test.records[0] as Record<string, unknown>).status = 'ADULTERADO';

      const onRestored = vi.fn();
      const { container } = render(<SecurityPackageRestore dbInstance={dst} onRestored={onRestored} />);
      upload(container, new File([JSON.stringify(adulterado)], 'adulterado.json', { type: 'application/json' }));

      expect(await screen.findByText(/Pacote recusado \(1 problema/)).toBeTruthy();
      expect(screen.getByText('hash do pacote não confere')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /RESTAURAR PACOTE/ })).toBeNull();
      expect(onRestored).not.toHaveBeenCalled();
      expect((await dst.table('assets_test').toArray()).map(r => r.primarykey)).toEqual(['INTACTO']);
    } finally {
      await src.delete();
      await dst.delete();
    }
  });

  it('recusa um ficheiro que não é JSON sem tocar na base-alvo', async () => {
    const dst = makeDb(`${DB_PREFIX}_lixo_dst_${++counter}`);
    await dst.open();
    try {
      await dst.table('assets_test').put({ primarykey: 'INTACTO' });

      const { container } = render(<SecurityPackageRestore dbInstance={dst} />);
      upload(container, new File(['isto não é um pacote de backup'], 'lixo.dat'));

      expect(await screen.findByText(/Pacote recusado: ficheiro não é JSON válido/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /RESTAURAR PACOTE/ })).toBeNull();
      expect((await dst.table('assets_test').toArray()).map(r => r.primarykey)).toEqual(['INTACTO']);
    } finally {
      await dst.delete();
    }
  });
});
