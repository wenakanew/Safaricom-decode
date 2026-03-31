import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CreditScore, Insight } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getFinancialAdvice(
  userMessage: string,
  transactions: Transaction[],
  creditScore?: CreditScore,
  insight?: Insight
) {
  const model = "gemini-3-flash-preview";
  
  const financialSummary = `
    User Transactions: ${JSON.stringify(transactions.slice(0, 10))}
    Total Income: ${insight?.totalIncome || 0}
    Total Expenses: ${insight?.totalExpenses || 0}
    Savings Potential: ${insight?.savingsPotential || 0}
    Credit Score: ${creditScore?.score || "N/A"} (${creditScore?.explanation || ""})
  `;

  const systemInstruction = `
    You are a helpful and empathetic financial assistant for mobile money users. 
    Your goal is to provide simple, actionable financial advice based on the user's transaction history and credit score.
    Keep your answers short, clear, and encouraging. 
    Use terms familiar to mobile money users (e.g., "send", "receive", "paybill").
    Always prioritize the user's financial well-being.
  `;

  const prompt = `
    Context: ${financialSummary}
    User Question: ${userMessage}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
}

export async function parseSmsToTransaction(smsText: string) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a specialized parser for mobile money SMS logs. 
    Extract the amount, type (send, receive, paybill), and date from the SMS.
    Return the data in a structured JSON format.
    If the SMS is not a transaction, return an empty object.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      amount: { type: Type.NUMBER },
      type: { type: Type.STRING, enum: ["send", "receive", "paybill"] },
      date: { type: Type.STRING, description: "ISO 8601 format" },
      description: { type: Type.STRING }
    },
    required: ["amount", "type", "date"]
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: smsText,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("SMS Parsing Error:", error);
    return null;
  }
}
