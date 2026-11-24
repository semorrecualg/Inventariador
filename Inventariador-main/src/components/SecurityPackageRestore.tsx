// src/components/SecurityPackageRestore.tsx
// F7 (2/2) — RESTAURO DO PACOTE DE BACKUP VERIFICADO.
//
// O export (F7 1/2) sela o pacote com `packageChecksum`; este ecrã é o outro
// lado: lê o `.json`/`.dat`, mostra o relatório de `verifySecurityExport` antes
// de escrever seja o que for, e só deixa restaurar quando o hash confere. A base
// só é substituída depois da confirmação explícita — o pacote substitui as
// tabelas que traz e deixa intactas as que não traz.
import React, { useRef, useState } from 'react';
import type Dexie from 'dexie';
import { AlertTriangle, RotateCcw, ShieldCheck, UploadCloud } from 'lucide-react';
import { db } from '../services/sqliteService';
import {
  parseSecurityExport,
  restoreSecurityExport,
  verifySecurityExport,
  type SecurityExportManifest,
  type SecurityRestoreResult
} from '../services/securityExportService';

export interface SecurityPackageRestoredInfo {
  manifest: SecurityExportManifest;
  result: SecurityRestoreResult;
  /** Registos repostos (soma das tabelas restauradas). */
  total: number;
}

interface SecurityPackageRestoreProps {
  /** Base alvo (padrão: `InventoryLocalStore` da aplicação). */
  dbInstance?: Dexie;
  /** Chamado depois de o restauro terminar com sucesso. */
  onRestored?: (info: SecurityPackageRestoredInfo) => void;
}

interface PackageInspection {
  fileName: string;
  manifest: SecurityExportManifest | null;
  problems: string[];
  /** Falha de leitura/parse: o ficheiro nem chegou a ser verificado. */
  error?: string;
}

const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('falha ao ler o ficheiro'));
    reader.readAsText(file);
  });

const packageTotal = (manifest: SecurityExportManifest): number =>
  Object.values(manifest.tables).reduce((sum, table) => sum + table.count, 0);

const restoredTotal = (result: SecurityRestoreResult): number =>
  Object.values(result.restored).reduce((sum, count) => sum + count, 0);

export const SecurityPackageRestore: React.FC<SecurityPackageRestoreProps> = ({
  dbInstance = db,
  onRestored
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inspection, setInspection] = useState<PackageInspection | null>(null);
  const [result, setResult] = useState<SecurityRestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const manifest = inspection?.manifest ?? null;
  const verified = Boolean(manifest) && !inspection?.error && (inspection?.problems.length ?? 0) === 0;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Limpa o input para permitir voltar a escolher o mesmo ficheiro.
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setResult(null);
    setRestoreError(null);
    setConfirming(false);
    try {
      const parsed = parseSecurityExport(await readFileText(file));
      const verification = await verifySecurityExport(parsed);
      setInspection({ fileName: file.name, manifest: parsed, problems: verification.problems });
    } catch (err) {
      setInspection({
        fileName: file.name,
        manifest: null,
        problems: [],
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setBusy(false);
    }
  };

  /** Escreve o pacote já verificado — só chega aqui com `verified` e confirmado. */
  const handleRestore = async () => {
    if (!manifest) return;
    setConfirming(false);
    setBusy(true);
    setRestoreError(null);
    try {
      const restored = await restoreSecurityExport(manifest, dbInstance);
      setResult(restored);
      onRestored?.({ manifest, result: restored, total: restoredTotal(restored) });
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col space-y-3">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-rose-950/40 text-rose-300 rounded-full border border-rose-900/30">
          <RotateCcw className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Restauro do Pacote de Backup</h3>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
            Seleciona o .json/.dat do pacote: o relatório de verificação aparece antes de qualquer escrita
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        id="security-package-restore"
        type="file"
        accept=".json,.dat,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all border border-slate-600/30 cursor-pointer"
      >
        <UploadCloud size={14} />
        <span>{busy ? 'LENDO PACOTE...' : 'SELECIONAR PACOTE (.json/.dat)'}</span>
      </button>

      {inspection && (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2.5 space-y-1.5">
          <p className="text-[9px] font-mono text-slate-400 uppercase tracking-wider break-all">{inspection.fileName}</p>
          {inspection.error ? (
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">
              Pacote recusado: {inspection.error} — nada foi tocado na base
            </p>
          ) : (
            <>
              <p className={`text-[10px] font-black uppercase tracking-wider ${verified ? 'text-emerald-300' : 'text-rose-300'}`}>
                {verified
                  ? <><ShieldCheck size={12} className="inline mr-1" />Hash verificado — pacote íntegro</>
                  : <><AlertTriangle size={12} className="inline mr-1" />Pacote recusado ({inspection.problems.length} problema(s)) — nada foi tocado na base</>}
              </p>
              {manifest && (
                <>
                  <p className="text-[9px] font-mono text-slate-400 break-all">
                    schema v{manifest.schemaVersion} · exportado {new Date(manifest.exportedAt).toLocaleString('pt-BR')} · {packageTotal(manifest)} registos
                  </p>
                  <p className="text-[9px] font-mono text-slate-500 break-all">
                    SHA-256 do pacote: {String(manifest.packageChecksum).slice(0, 32)}…
                  </p>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
                    {Object.entries(manifest.tables).map(([name, table]) => (
                      <p key={`restore-table-${name}`} className="text-[9px] font-mono text-slate-300 break-words">
                        {name}: {table.count} registo(s)
                      </p>
                    ))}
                  </div>
                </>
              )}
              {inspection.problems.map((problem, index) => (
                <p key={`restore-problem-${index}`} className="text-[9px] font-mono text-rose-200 break-words">{problem}</p>
              ))}
            </>
          )}
        </div>
      )}

      {verified && !result && !confirming && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-rose-800/80 hover:bg-rose-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all border border-rose-600/40 cursor-pointer"
        >
          <RotateCcw size={14} />
          <span>RESTAURAR PACOTE</span>
        </button>
      )}

      {confirming && manifest && (
        <div
          role="alertdialog"
          aria-label="Confirmar restauro do pacote"
          className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-3 py-2.5 space-y-2"
        >
          <p className="text-[10px] font-bold text-amber-100 uppercase leading-relaxed">
            O pacote substitui o conteúdo das {Object.keys(manifest.tables).length} tabelas que traz ({packageTotal(manifest)} registos). Tabelas fora do pacote ficam intactas. Confirmas o restauro nesta base?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-black uppercase tracking-widest cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { void handleRestore(); }}
              className="flex-1 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest cursor-pointer"
            >
              CONFIRMAR RESTAURO
            </button>
          </div>
        </div>
      )}

      {restoreError && (
        <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">
          Restauro recusado: {restoreError}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
            Pacote restaurado: {restoredTotal(result)} registos em {Object.keys(result.restored).length} tabela(s)
          </p>
          {Object.entries(result.restored).map(([name, count]) => (
            <p key={`restored-${name}`} className="text-[9px] font-mono text-emerald-200">{name}: {count} registo(s)</p>
          ))}
          {result.skipped.length > 0 && (
            <p className="text-[9px] font-mono text-amber-300 break-words">
              Puladas (ausentes na base-alvo): {result.skipped.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
