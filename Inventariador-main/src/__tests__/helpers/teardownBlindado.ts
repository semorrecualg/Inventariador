import { vi, type MockInstance } from 'vitest';

// ============================================================================
// teardownBlindado — um só sítio para a blindagem dos testes que montam o App.
//
// O `App` continua a registar depois do unmount: `logger.info`/`warn`/`error`
// chamam `console.*` num tick seguinte. Se o worker do Vitest fechar a meio
// desse log, o CI fica vermelho com todos os testes verdes:
//
//   EnvironmentTeardownError: [vitest-worker]: Closing rpc while
//   "onUserConsoleLog" was pending
//
// A blindagem: stubs no console antes de montar e, no fim, o unmount seguido
// de uma pausa com o jsdom ainda vivo. Só depois da pausa os mocks voltam.
// ============================================================================

/** Pausa entre o unmount e o fim do teste, para os logs do arranque assentarem. */
export const PAUSA_TEARDOWN_MS = 1200;

const METODOS_DO_CONSOLE = ['log', 'info', 'warn', 'error'] as const;

let stubs: MockInstance[] = [];

/** Stuba `console.log/info/warn/error` para o teste que monta o App. */
export const silenciarConsoleDoArranque = (): void => {
  stubs = METODOS_DO_CONSOLE.map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => {})
  );
};

/**
 * Desmonta a árvore (`unmount`), dá tempo aos logs pendentes e só então
 * devolve o console original.
 */
export const assentarEAntesDoTeardown = async (unmount: () => void): Promise<void> => {
  unmount();
  await new Promise((resolve) => setTimeout(resolve, PAUSA_TEARDOWN_MS));
  stubs.forEach((stub) => stub.mockRestore());
  stubs = [];
};
