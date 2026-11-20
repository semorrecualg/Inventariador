/**
 * DIAGNÓSTICO DE ACESSO — o conteúdo do ecrã que responde, em 10 segundos e sem
 * devtools, «porque é que o CONTRATO não abre?».
 *
 * Tudo aqui é puro (sem React, sem browser): a tela só mostra o que este módulo
 * decide, e os testes fixam as regras de origem das filiais — a pergunta que
 * custou este incidente inteiro («as filiais vêm da base local, da nuvem ou de
 * nenhum lado?»).
 */

/** De onde vêm as filiais que o CONTRATO está a mostrar. */
export type FiliaisOrigem = 'base local' | 'lista da nuvem' | 'cache' | 'nenhuma';

export interface AccessDiagnosticInput {
  /** Contrato resolvido (tenantid); vazio quando o perfil não fixa um. */
  contrato?: string | null;
  /** Modo da base: INTERNAL (só aparelho) ou SUPABASE (nuvem). */
  modo: 'INTERNAL' | 'SUPABASE';
  /** Filiais/unidades que o ecrã de contexto conhece. */
  contextos: number;
  /** A base local já responde pelas filiais DESTE contrato. */
  filiaisNaBase: boolean;
  /** Nomes guardados em memória vindos da nuvem (0 = sem lista). */
  filiaisDaNuvem: number;
  /** Nomes servidos do cache do aparelho (0 = sem cache). */
  filiaisDaCache: number;
  /** Unidades com âncora GPS configurada. */
  unidadesComAncora: number;
  /** Unidades com campanha ativa. */
  unidadesComCampanha: number;
  /** Ativos guardados no aparelho (base local). */
  ativosLocais: number;
  /** Hora (ms) da última consulta de nomes à nuvem; null = nunca nesta sessão. */
  nomesConsultadosEm?: number | null;
  /** Última falha de rede registada (mensagem curta), se houver. */
  ultimoErroDeRede?: string | null;
  /** Agora (ms) — injectável para os testes. */
  agora?: number;
}

export interface AccessDiagnosticLine {
  rotulo: string;
  valor: string;
}

export interface AccessDiagnostic {
  origem: FiliaisOrigem;
  linhas: AccessDiagnosticLine[];
  /** Bloco de texto copiável (uma linha por indicador). */
  texto: string;
}

/**
 * Prioridade da origem: a base local manda quando responde pelo contrato; depois
 * a lista da nuvem; depois o cache do aparelho. `nenhuma` é o caso que fecha o
 * INVENTARIADOR («Nenhuma filial na base deste contrato»).
 */
export function decideFiliaisOrigem(input: AccessDiagnosticInput): FiliaisOrigem {
  if (input.filiaisNaBase) return 'base local';
  if (input.filiaisDaNuvem > 0) return 'lista da nuvem';
  if (input.filiaisDaCache > 0) return 'cache';
  return 'nenhuma';
}

/** Hora local `HH:MM` de um carimbo (ms); `—` quando não houve consulta. */
export function formatHoraDaConsulta(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  const data = new Date(ms);
  const hh = String(data.getHours()).padStart(2, '0');
  const mm = String(data.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Há quanto tempo foi a consulta, em minutos (para a linha «há X min»). */
export function minutosDesde(ms: number | null | undefined, agora: number = Date.now()): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const minutos = Math.floor((agora - ms) / 60000);
  return minutos < 0 ? 0 : minutos;
}

/**
 * Monta as linhas do diagnóstico e o bloco de texto copiável.
 *
 * Deliberadamente curto: contrato, modo, contextos, **origem das filiais**,
 * âncoras/campanhas, ativos locais, hora da última consulta de nomes e o último
 * erro de rede. É o suficiente para o dono dizer ao telefone onde está o
 * problema, sem abrir consola.
 */
export function buildAccessDiagnostic(input: AccessDiagnosticInput): AccessDiagnostic {
  const origem = decideFiliaisOrigem(input);
  const contrato = String(input.contrato || '').trim().toUpperCase() || 'SEM CONTRATO';
  const hora = formatHoraDaConsulta(input.nomesConsultadosEm);
  const minutos = minutosDesde(input.nomesConsultadosEm, input.agora ?? Date.now());

  const linhas: AccessDiagnosticLine[] = [
    { rotulo: 'Contrato', valor: contrato },
    { rotulo: 'Modo', valor: input.modo },
    { rotulo: 'Contextos', valor: String(input.contextos) },
    {
      rotulo: 'Filiais',
      valor:
        origem === 'nenhuma'
          ? 'nenhuma (nem base local, nem nuvem, nem cache)'
          : `${origem} (${input.filiaisNaBase ? input.contextos : Math.max(input.filiaisDaNuvem, input.filiaisDaCache)})`
    },
    { rotulo: 'Âncoras configuradas', valor: `${input.unidadesComAncora}` },
    { rotulo: 'Campanhas ativas', valor: `${input.unidadesComCampanha}` },
    { rotulo: 'Ativos no aparelho', valor: String(input.ativosLocais) },
    {
      rotulo: 'Nomes consultados',
      valor: hora === '—' ? 'nunca nesta sessão' : `${hora}${minutos !== null ? ` (há ${minutos} min)` : ''}`
    },
    { rotulo: 'Último erro de rede', valor: String(input.ultimoErroDeRede || '').trim() || 'nenhum' }
  ];

  const texto = [
    'GBR KARDEK · diagnóstico de acesso',
    ...linhas.map((linha) => `${linha.rotulo}: ${linha.valor}`)
  ].join('\n');

  return { origem, linhas, texto };
}
