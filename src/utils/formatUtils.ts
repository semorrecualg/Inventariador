
/**
 * Utilitários de formatação para exibição de dados de ativos.
 */

export const parseAssetDate = (val: string | number | null | undefined): Date | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export const formatDateBR = (val: string | number | null | undefined): string => {
  const date = parseAssetDate(val);
  if (date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  return String(val || '').toUpperCase();
};

export const formatMonthYearBR = (val: string | number | null | undefined): string => {
  const date = parseAssetDate(val);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return String(val || '').toUpperCase();
};

export const formatCurrency = (val: string | number | null | undefined): string => {
  if (!val) return "R$ 0,00";
  const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  if (isNaN(num)) return String(val).toUpperCase();
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

export const formatEtiqueta = (val: string | number | null | undefined): string => {
  const s = String(val || '').trim();
  if (!s || s.toUpperCase() === 'ETIQUETAR') return s.toUpperCase();
  return s.padStart(6, '0');
};

/**
 * Remove redundância em strings (ex: "Empresa A Empresa A" -> "Empresa A")
 * Também limpa valores nulos ou inválidos comuns em planilhas
 */
export const deduplicateRedundantString = (s: string | null | undefined): string => {
  if (s === undefined || s === null) return "";
  let str = String(s).trim().replace(/\s+/g, ' ');
  const upper = str.toUpperCase();
  if (upper === "" || upper === "NULL" || upper === "0" || upper.includes("#N/D") || upper.includes("#REF")) return "";
  
  const parts = str.split(' ');
  if (parts.length > 1 && parts.length % 2 === 0) {
    const mid = parts.length / 2;
    const firstHalf = parts.slice(0, mid).join(' ').toUpperCase();
    const secondHalf = parts.slice(mid).join(' ').toUpperCase();
    if (firstHalf === secondHalf) {
      str = parts.slice(0, mid).join(' ');
    }
  }
  return str.toUpperCase();
};
