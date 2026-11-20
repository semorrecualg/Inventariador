/**
 * RETENÇÃO DA TRILHA DE AUDITORIA
 * ============================================================================
 * O ciclo de sincronização apagava **tudo** o que tivesse mais de 7 dias em
 * `audit_logs`. As linhas que explicam uma recusa do envio
 * (`SYNC_RECORD_FAIL` / `SYNC_RECORD_EXCEPTION`) caíam nesse expurgo: o carimbo
 * `_syncFailAt` sobrevivia no ativo, mas a causa desaparecia da trilha ao fim de
 * uma semana — precisamente quando o suporte a vai procurar.
 *
 * A falha de envio é prova de auditoria (diz por que o registo não chegou à
 * nuvem) e passa a ficar; o resto continua a ser expurgado aos
 * `RETENCAO_AUDITORIA_DIAS` dias, que é o limite de disco que motivou o guard.
 */
import { db } from './sqliteService';
import { ehFalhaDeEnvio } from '../utils/auditActions';
import { idsDeFalhasRepetidas } from '../utils/syncFalha';

/** Idade a partir da qual a trilha é expurgada (falhas de envio de fora). */
export const RETENCAO_AUDITORIA_DIAS = 7;

export interface ResultadoDoExpurgo {
  /** Linhas apagadas nesta passagem. */
  apagadas: number;
  /** Das apagadas, quantas eram falhas de envio repetidas do mesmo dia. */
  consolidadas: number;
  /** Limite usado (ISO) — tudo o que é anterior e não é falha de envio sai. */
  limite: string;
}

/**
 * Apaga a trilha antiga, preservando as recusas de envio.
 *
 * `agora` é parâmetro para os testes não dependerem do relógio.
 */
export const purgarAuditoriaAntiga = async (
  agora: number = Date.now(),
  dias: number = RETENCAO_AUDITORIA_DIAS
): Promise<ResultadoDoExpurgo> => {
  const limite = new Date(agora - dias * 24 * 60 * 60 * 1000).toISOString();

  // Lê e apaga por chave em vez de `Collection.delete()`: o filtro decide o que
  // fica, e o expurgo tem de ser explícito sobre o que apagou.
  const vencidas = await db.audit_logs.where('updated_at').below(limite).toArray();
  const alvo = vencidas.filter((log) => !ehFalhaDeEnvio(log.acao));

  // TETO: as falhas preservadas ficam com a linha mais recente de cada
  // (ação + registo + dia + assinatura). O histórico anterior a este teto tem
  // uma linha a cada 10 min do mesmo erro (144/dia) e era preservado para
  // sempre — aqui passa a uma por dia. As linhas sem assinatura legível não são
  // tocadas (não há como saber se são a mesma falha).
  const falhasVencidas = vencidas.filter((log) => ehFalhaDeEnvio(log.acao));
  const repetidas = idsDeFalhasRepetidas(falhasVencidas);
  if (repetidas.length > 0) {
    await db.audit_logs.bulkDelete(repetidas);
  }

  if (alvo.length > 0) {
    await db.audit_logs.bulkDelete(alvo.map((log) => log.id));
  }

  return { apagadas: alvo.length + repetidas.length, consolidadas: repetidas.length, limite };
};
