import React, { useState } from 'react';
import { db } from '../services/sqliteService';
import { showRecoveryToast } from '../services/NavigationGuardService';
import { AppScreen } from '../types';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { selectAndVerifyWorkspaceFolder, saveSnapshotToWorkspace } from '../services/localDbService';

export async function processAndInjectSpreadsheetData(file: File, onProgress: (p: number) => void): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const data = await DatabaseLoaderService.extrairDadosDaPlanilha(file);
  if (!data || data.length === 0) {
    throw new Error("Planilha vazia ou inválida.");
  }
  await DatabaseLoaderService.injetarDadosEmLotes(data, onProgress);
  return data;
}

export function useDatabaseManagerController() {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isPurgingInternal, setIsPurgingInternal] = useState<boolean>(false);

  const setIsPurging = (value: boolean | ((prev: boolean) => boolean)) => {
    const resolvedValue = typeof value === 'function' ? value(isPurgingInternal) : value;
    
    if (resolvedValue === true) {
      const trace = new Error().stack;
      console.warn(">>> [SRE ALERTA CHAVEAMENTO] GATILHO DE PURGA DETECTADO EM EXECUÇÃO!");
      console.warn(">>> [PILHA DE CHAMADAS DE ORIGEM]:", trace);
    }
    
    setIsPurgingInternal(resolvedValue);
  };

  const isPurging = isPurgingInternal;
  const [progress, setProgress] = useState<number>(0);
  const [activePathName, setActivePathName] = useState<string>("NENHUM DIRETÓRIO VINCULADO");

  const handleUnifiedWorkspacePipeline = async () => {
    setIsUploading(true);
    setProgress(0);
    const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
  
    // Executa a abertura de pasta, validação e captura automática do arquivo Excel contido nela
    const workspaceResult = await selectAndVerifyWorkspaceFolder();
  
    if (!workspaceResult || !workspaceResult.fileBlob) {
      setActivePathName(workspaceResult ? workspaceResult.pathName : "NENHUM DIRETÓRIO VINCULADO");
      setIsUploading(false);
      return;
    }
  
    // Sincroniza o texto visual reativo com o nome da pasta do Windows Explorer
    setActivePathName(workspaceResult.pathName);
  
    try {
      // Processa o binário do arquivo Excel extraído dinamicamente da pasta
      const assetsInjected = await processAndInjectSpreadsheetData(workspaceResult.fileBlob, (currentProgress) => {
        setProgress(currentProgress);
      });
  
      // Despeja o arquivo de backup de dados físicos no mesmo diretório autorizado
      const isFileSaved = await saveSnapshotToWorkspace(assetsInjected);
      
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsUploading(false);
  
      if (isFileSaved) {
        showRecoveryToast("✓ INTEGRADO E BACKUP GRAVADO COM SUCESSO NA MESMA PASTA.", "blue");
      } else {
        showRecoveryToast("❌ ERRO REAL: FALHA DE ESCRITA NO WINDOWS.", "red");
      }
    } catch (error) {
      localStorage.setItem('gbr_kardek_history', stableHistory);
      setIsUploading(false);
      console.error("[SRE CRÍTICO] Colapso na esteira local de arquivos:", error);
    }
  };

  return {
    isUploading,
    setIsUploading,
    isPurging,
    setIsPurging,
    progress,
    setProgress,
    activePathName,
    handleUnifiedWorkspacePipeline,
    handleSpreadsheetLoad: handleUnifiedWorkspacePipeline,
    handleCompleteDatabasePurge: () => handleCompleteDatabasePurge(setIsPurging)
  };
}

export function DirectoryBar({ activePathName }: { activePathName: string }) {
  return (
    <div className="directory-bar-wrapper" style={{ padding: '12px', background: '#0f172a', borderRadius: '4px' }}>
      <span style={{ fontSize: '11px', color: activePathName.includes("NENHUM") ? '#ff1744' : '#64ffda', fontFamily: 'monospace' }}>
        📁 DIRETÓRIO DE PERSISTÊNCIA FÍSICA ATIVA: {activePathName}
      </span>
    </div>
  );
}

export async function handleCompleteDatabasePurge(setIsPurging?: (val: boolean) => void): Promise<void> {
  const stableHistory = JSON.stringify([AppScreen.DATABASE_MANAGER]);
  if (setIsPurging) setIsPurging(true);
  
  try {
    console.log("[SRE TELEMETRIA] Iniciando esvaziamento de coleções via Dexie.js...");
    
    // Evita o db.delete() destrutivo que quebrava as conexões pendentes do app
    await db.transaction('rw', [db.local_assets, db.addresses], async () => {
      await db.local_assets.clear();
      await db.addresses.clear();
    });

    localStorage.setItem('gbr_kardek_history', stableHistory);
    if (setIsPurging) setIsPurging(false);
    showRecoveryToast("⚡ REGISTROS PURGADOS. ESTABILIDADE DA SESSÃO PRESERVADA.", "blue");
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    localStorage.setItem('gbr_kardek_history', stableHistory);
    if (setIsPurging) setIsPurging(false);
    console.error("[SRE CRÍTICO] Crash de barramento evitado pelo interceptor:", error);
    showRecoveryToast("❌ OPERAÇÃO DE LIMPEZA INTERROMPIDA PELO SISTEMA.", "blue");
  }
}

export const DatabaseManagerScreen: React.FC = () => {
  const {
    isUploading,
    isPurging,
    progress,
    activePathName,
    handleUnifiedWorkspacePipeline,
    handleCompleteDatabasePurge
  } = useDatabaseManagerController();

  return (
    <div className="admin-container-wrapper">
      {/* 1. Injeta de forma dinâmica a barra de diretório vinculada ao Windows Explorer */}
      <div className="directory-bar-wrapper" style={{ padding: '12px', background: '#0f172a', borderRadius: '4px' }}>
        <span style={{ fontSize: '11px', color: activePathName.includes("NENHUM") ? '#ff1744' : '#64ffda', fontFamily: 'monospace' }}>
          📁 DIRETÓRIO DE PERSISTÊNCIA FÍSICA ATIVA: {activePathName}
        </span>
      </div>

      {/* 2. Vincula o botão de carga ao método unificado de extração de arquivo da pasta GBR_Inventario */}
      <button 
        disabled={isUploading || isPurging}
        onClick={handleUnifiedWorkspacePipeline}
        className="btn-load-excel"
      >
        {isUploading ? `CARGA: ${progress}%` : "NAVEGAR E CARREGAR PLANILHA"}
      </button>

      {/* 3. Garante que o botão de purga responda estritamente à flag limpa e sem efeitos colaterais */}
      <button 
        disabled={isUploading || isPurging}
        onClick={handleCompleteDatabasePurge}
        className="btn-purge-action"
      >
        {isPurging ? "EXECUTANDO PURGA..." : "BASE JÁ HIGIENIZADA"}
      </button>
    </div>
  );
};
