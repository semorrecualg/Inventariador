/**
 * Ambiente de testes determinístico.
 *
 * O Vitest corre com `environment: 'node'`, que não traz `localStorage` nem
 * `sessionStorage`. Em Node ≥ 25 o global chega a existir mas vale `undefined`
 * (só é preenchido com `--localstorage-file`), e o resultado dependia do shell:
 * com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` definidos, a app saía do
 * modo INTERNAL no import e suites inteiras rebentavam com "Cannot read
 * properties of undefined (reading 'getItem')".
 *
 * Aqui instalamos um Storage em memória apenas quando o ambiente não fornece um
 * — jsdom (testes com `@vitest-environment jsdom`) já traz o seu, e nesse caso
 * não tocamos em nada.
 */

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    const k = String(key);
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.data.set(String(key), String(value));
  }
}

const hasStorage = (name: 'localStorage' | 'sessionStorage'): boolean => {
  try {
    return Boolean((globalThis as unknown as Record<string, unknown>)[name]);
  } catch {
    // Getter indisponível (Node sem --localstorage-file): tratamos como ausente.
    return false;
  }
};

const installStorage = (name: 'localStorage' | 'sessionStorage'): void => {
  if (hasStorage(name)) return;
  const storage = new MemoryStorage();
  try {
    Object.defineProperty(globalThis, name, {
      value: storage,
      configurable: true,
      writable: true
    });
  } catch {
    try {
      (globalThis as unknown as Record<string, unknown>)[name] = storage;
    } catch {
      // Ambiente imutável: a suíte falha alto em vez de silenciar a ausência.
    }
  }
};

installStorage('localStorage');
installStorage('sessionStorage');
