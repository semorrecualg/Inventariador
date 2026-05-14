import { GoogleGenAI } from "@google/genai";
import { Asset, InventoryCampaign } from "../types";

// Inicialização segura do SDK
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(">>> [Gemini] API Key não encontrada. Insights desativados.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export interface ProgressInsight {
  summary: string;
  recommendations: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  criticalAreas: string[];
}

/**
 * Gera insights proativos baseados no progresso do inventário por localidade.
 */
export const generateInventoryInsights = async (
  campaigns: InventoryCampaign[],
  assets: Asset[]
): Promise<ProgressInsight | null> => {
  const ai = getAI();
  if (!ai) return null;

  try {
    // Preparar dados resumidos para o prompt (evitar enviar milhares de linhas)
    const summaryData = campaigns.map(c => {
      const campaignAssets = assets.filter(a => a._campaignId === c.id || a.UNIDADE === c.name);
      const total = campaignAssets.length;
      const conferidos = campaignAssets.filter(a => a._conferido || a.AUDITOR_STATUS_CONFERENCIA === 'SIM').length;
      const divergencias = campaignAssets.filter(a => a.TAG_INVENTARIO === 'DIVERGÊNCIA').length;
      const progresso = total > 0 ? (conferidos / total) * 100 : 0;

      return {
        localidade: c.name,
        total,
        conferidos,
        divergencias,
        progresso: progresso.toFixed(2) + '%',
        status: c.status
      };
    });

    const prompt = `
      Como um Auditor Sênior e Especialista em Gestão de Ativos (CPC 27), analise os seguintes dados de progresso de inventário e forneça insights proativos.
      
      Dados das Localidades:
      ${JSON.stringify(summaryData, null, 2)}

      Sua resposta deve ser um objeto JSON estrito com a seguinte estrutura:
      {
        "summary": "Um resumo executivo do status geral (máximo 3 frases).",
        "recommendations": ["Lista de 3 a 5 recomendações acionáveis."],
        "riskLevel": "LOW" | "MEDIUM" | "HIGH",
        "criticalAreas": ["Lista de localidades ou departamentos que exigem atenção imediata."]
      }
      
      Foque em identificar gargalos, riscos de conformidade e áreas com alta taxa de divergência.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    if (!response.text) return null;

    return JSON.parse(response.text.trim()) as ProgressInsight;
  } catch (error) {
    console.error(">>> [Gemini] Erro ao gerar insights:", error);
    return null;
  }
};

/**
 * Fornece orientações sobre o ambiente atual.
 */
export const getEnvironmentGuidance = async (environment: string): Promise<string> => {
  const ai = getAI();
  if (!ai) return "O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Forneça uma frase curta e inspiradora para um auditor de inventário trabalhando no ambiente de ${environment}.`,
    });
    return response.text || "O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.";
  } catch {
    return "O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.";
  }
};
