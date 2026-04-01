import { GoogleGenAI } from "@google/genai";
import { Asset } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Gera ativos de teste usando IA para popular o ambiente de Staging.
 */
export const generateTestAssets = async (theme: string, count: number = 5): Promise<Partial<Asset>[]> => {
  if (!apiKey) {
    throw new Error("Gemini API Key não configurada. Verifique o arquivo .env");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  const prompt = `Você é um assistente de auditoria patrimonial. Gere uma lista de ${count} ativos imobilizados fictícios para testes de sistema.
  O tema dos ativos deve ser: "${theme}".
  
  Retorne APENAS um array JSON de objetos seguindo exatamente esta estrutura:
  {
    "ETIQUETA": "string (ex: TEST001)",
    "DESCRICAODOATIVO": "string (descrição técnica e realista)",
    "GRUPO_EMPRESARIAL": "string (ex: EMPRESA TESTE S.A.)",
    "UNIDADE_OPERACIONAL": "string (ex: MATRIZ)",
    "CONTACONTABIL": "string (ex: 1.02.03.001)",
    "CENTRODECUSTO": "string (ex: 100.01)",
    "VLRAQUISIC": number,
    "DATAAQUISIC": "string (formato YYYY-MM-DD)",
    "ESTADO_CONSERVACAO": "NOVO" | "BOM" | "RECUPERAVEL" | "INSERVIVEL",
    "TAG_INVENTARIO": "PENDENTE"
  }
  
  Importante: Gere dados variados e realistas dentro do tema solicitado.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("[Gemini] Erro ao gerar ativos:", error);
    throw error;
  }
};

/**
 * Obtém uma explicação inteligente sobre o ambiente atual.
 */
export const getEnvironmentGuidance = async (environment: string): Promise<string> => {
  if (!apiKey) return "Chave Gemini não configurada.";

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  const prompt = `Explique brevemente (máximo 3 frases) o propósito de um ambiente de "${environment}" em um sistema de auditoria patrimonial. 
  Se for "staging", enfatize que é um lugar seguro para testes e homologação sem afetar dados reais. 
  Se for "development", enfatize que é para novas funcionalidades.
  Seja profissional e motivador.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }]
    });

    return response.text || "Sem orientação disponível no momento.";
  } catch (error) {
    console.error("[Gemini] Erro ao obter orientação:", error);
    return "Ocorreu um erro ao consultar o assistente de IA.";
  }
};
