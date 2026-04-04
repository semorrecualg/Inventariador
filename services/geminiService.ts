import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Obtém uma explicação inteligente sobre o ambiente atual.
 */
export const getEnvironmentGuidance = async (environment: string): Promise<string> => {
  if (!apiKey) return "Chave Gemini não configurada.";

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  const prompt = `Explique brevemente (máximo 2 frases) o propósito de um ambiente de "${environment}" em um sistema de auditoria patrimonial. 
  Enfatize que este é o ambiente de trabalho atual para desenvolvimento e melhoria contínua.
  Seja profissional e direto.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }]
    });

    return response.text || "O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.";
  } catch (error) {
    console.error("[Gemini] Erro ao obter orientação:", error);
    return "O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.";
  }
};
