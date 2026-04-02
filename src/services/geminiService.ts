
import { GoogleGenAI, Type } from "@google/genai";
import { ShiftCode, SmartParseShiftResult, EventCategory } from "../types";

// Always use process.env.API_KEY directly for initialization as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const parseShiftFromText = async (text: string, technicians: string[], referenceDate: string): Promise<SmartParseShiftResult | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current reference date is ${referenceDate}. 
      Valid technicians: ${technicians.join(', ')}.
      Valid shift codes: ${Object.values(ShiftCode).join(', ')}.
      
      Parse this request: "${text}". 
      Return the technician name, the specific date, and the shift code.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            technicianName: { type: Type.STRING },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            shiftCode: { type: Type.STRING, enum: Object.values(ShiftCode) },
            confidence: { type: Type.NUMBER }
          },
          required: ["technicianName", "date", "shiftCode", "confidence"]
        }
      }
    });

    // response.text is a property that returns the generated text content
    return JSON.parse(response.text) as SmartParseShiftResult;
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return null;
  }
};

// Added missing parseEventFromText for generic scheduling capabilities
export const parseEventFromText = async (text: string, referenceTime: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current reference time is ${referenceTime}.
      Parse this event request: "${text}".
      Return the title, start time (ISO), end time (ISO), category (work, personal, other), and description.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            start: { type: Type.STRING, description: "ISO 8601 timestamp" },
            end: { type: Type.STRING, description: "ISO 8601 timestamp" },
            category: { type: Type.STRING, enum: Object.values(EventCategory) },
            description: { type: Type.STRING }
          },
          required: ["title", "start", "end", "category"]
        }
      }
    });

    // Access text property directly
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Event Parsing Error:", error);
    return null;
  }
};
