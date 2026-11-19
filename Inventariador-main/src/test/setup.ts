/**
 * ARMAZENAMENTO DO JSDOM ACIMA DO DO NODE
 * ============================================================================
 * O jsdom traz `localStorage`/`sessionStorage` próprios, mas um Node com o
 * webstorage ligado (`--experimental-webstorage`, `--localstorage-file`, ou o
 * que vier a ser default) já tem um global com esse nome, inútil sem
 * `--localstorage-file` (lança ao aceder). O vitest só instala as chaves da
 * janela que ainda não existem no global, por isso o storage do jsdom ficava
 * tapado e testes que persistem preferências caíam — dependendo dos flags do
 * Node do ambiente.
 *
 * A janela verdadeira do jsdom continua disponível em `globalThis.jsdom.window`
 * (o vitest põe-na lá antes de correr os setup files). Aqui o global volta a
 * apontar para o storage dessa janela. Em ambiente `node` não há janela e não
 * há nada a repor.
 */
const ARMAZENAMENTOS = ['localStorage', 'sessionStorage'] as const;

type JanelaComStorage = Record<(typeof ARMAZENAMENTOS)[number], Storage>;

const janela = (globalThis as unknown as { jsdom?: { window?: JanelaComStorage } }).jsdom?.window;

for (const nome of ARMAZENAMENTOS) {
  const doJsdom = janela?.[nome];
  if (!doJsdom) continue;

  // Já é o objecto do jsdom.
  if (Object.getOwnPropertyDescriptor(globalThis, nome)?.value === doJsdom) continue;

  // O global do Node é um getter configurável: substituí-lo é seguro.
  Object.defineProperty(globalThis, nome, {
    value: doJsdom,
    configurable: true,
    writable: true,
    enumerable: true
  });
}
