// src/services/MemoryGuardService.ts

export class MemoryGuardService {
  /**
   * Higieniza referências de memória de arrays massivos de forma segura.
   * Evita anular estados reativos de UI sem antes desvincular os nós dependentes.
   */
  public static releaseMassiveArray<T>(arrayRef: T[] | null): T[] {
    if (!arrayRef) return [];
    
    // Força a quebra de referências internas do array limpando seus índices
    while (arrayRef.length > 0) {
      arrayRef.pop();
    }
    
    // Retorna fallback seguro vazio para manter integridade de propriedades '.length'
    return [];
  }
}
