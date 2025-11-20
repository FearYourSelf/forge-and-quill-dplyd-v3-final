
import { GoogleGenAI, Type, Modality, FunctionDeclaration, Tool } from "@google/genai";
import { decode, pcmToAudioBuffer } from "./audioUtils";
import { SuggestionTask, AnalysisResult, Highlight } from "../types";

// Helper to get client instance lazily
const getAiClient = () => {
  // Ensure we are using the standard API_KEY which is polyfilled by vite.config.ts
  // to include GEMINI_API_KEY if present.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const createFullCharacterTool: FunctionDeclaration = {
  name: 'createFullCharacter',
  description: 'Creates or Overhauls a complete character profile, including settings, story draft intro, and world lore in one go. USE THIS for new characters.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      role: { type: Type.STRING },
      age: { type: Type.STRING },
      personality: { type: Type.STRING },
      backstory: { type: Type.STRING },
      biography: { type: Type.STRING },
      draft_intro: { type: Type.STRING, description: 'A compelling 300+ word introductory scene/story starter for the Draft tab.' },
      world_lore: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          }
        },
        description: 'Array of 3-5 world building items related to the character.'
      }
    },
    required: ['name', 'role', 'personality', 'draft_intro', 'world_lore']
  }
};

const updateStoryTool: FunctionDeclaration = {
  name: 'updateStory',
  description: 'Updates or appends text to the user\'s main story draft.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The content to write or append.' },
      action: { type: Type.STRING, description: 'Either "replace" or "append". Default is append.', enum: ['replace', 'append'] }
    },
    required: ['text']
  }
};

const updateCharacterProfileTool: FunctionDeclaration = {
  name: 'updateCharacterProfile',
  description: 'Updates the character settings fields.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      field: { type: Type.STRING, enum: ['name', 'role', 'age', 'personality', 'backstory', 'biography'] },
      value: { type: Type.STRING }
    },
    required: ['field', 'value']
  }
};

const addWorldEntryTool: FunctionDeclaration = {
  name: 'addWorldEntry',
  description: 'Adds a lore entry, location, relationship, or magic rule to the World Codex.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'], description: 'The category of the entry.' },
      title: { type: Type.STRING, description: 'The title of the entry (e.g. "The Crystal Spire").' },
      description: { type: Type.STRING, description: 'The description/details of the entry.' }
    },
    required: ['category', 'title', 'description']
  }
};

const SYSTEM_INSTRUCTION = `You are 'Geny', the 'Forge & Quill' writing assistant. 
Your goal is to help users create rich, consistent roleplay characters for Talkie.
Persona: Casual, optimistic, encouraging, and creative. You are a supportive co-writer.
Creator: You were crafted with love by "NotSoDangerous" for the Talkie community.

Rules:
1. Never produce hate speech, discriminatory content, explicit non-consensual sexual violence, or illegal content.
2. Optimize outputs for Talkie's 4000-character limit when asked for prompts.
3. Be concise but evocative.
4. **CRITICAL**: When the user asks you to create a NEW character or overhaul an existing one, you MUST use the 'createFullCharacter' tool.
   - Do NOT call updateCharacterProfile, updateStory, and addWorldEntry separately for a new character. 
   - Use 'createFullCharacter' to do it all at once to ensure the app updates correctly.
   - Ensure 'draft_intro' is at least 300 words of high-quality narrative.
   - Ensure 'world_lore' has at least 3 entries.
5. If the user asks to update just ONE part (e.g. "Change the name", "Add a paragraph to the story"), use the specific tools ('updateCharacterProfile', 'updateStory').
6. **PERSONALITY**: When you use a tool, DO NOT be silent. You must provide a conversational response telling the user what you did.
   - BAD: [Silent]
   - BAD: "Done."
   - GOOD: "I've conjured up [Name]! Check out the Draft tab for their intro scene and the World Codex for some spicy lore about their hometown."`;

// Models - Using Flash for speed and generous free tier quotas
const MODEL_CHAT = 'gemini-2.5-flash';
const MODEL_FAST = 'gemini-2.5-flash'; 
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

export const appTools: Tool[] = [{
  functionDeclarations: [createFullCharacterTool, updateStoryTool, updateCharacterProfileTool, addWorldEntryTool]
}];

// --- Error Helper ---
// Parses generic API errors into human readable strings
const parseGeminiError = (error: any): string => {
  const msg = error?.message || String(error);
  
  if (msg.includes('429') || msg.includes('quota')) {
    return "Usage limit exceeded (429). Please wait a moment or check your API plan quotas.";
  }
  if (msg.includes('API key')) {
    return "API Key is missing or invalid. Please check your .env file.";
  }
  if (msg.includes('503') || msg.includes('overloaded')) {
    return "The AI service is temporarily overloaded. Please try again in a few seconds.";
  }
  
  // If it's a JSON error dump, try to extract the message
  if (msg.trim().startsWith('{')) {
      try {
          const parsed = JSON.parse(msg);
          return parsed.error?.message || parsed.message || "Unknown API Error";
      } catch (e) {
          // content is not valid json, return substring
          return msg.substring(0, 100) + "...";
      }
  }

  return msg;
};

export const chatWithGeminiStream = async function* (
  history: { role: string; parts: { text?: string; inlineData?: any }[] }[],
  message: string,
  image?: string,
  draftContext?: string
) {
  try {
    const ai = getAiClient();
    const parts: any[] = [];
    if (image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: image
        }
      });
    }
    // Inject context into the message if provided
    let fullMessage = message;
    if (draftContext) {
        fullMessage = `[Current Draft Context (Visible to AI, not user)]:\n${draftContext.substring(0, 3000)}...\n\n[User Request]: ${message}`;
    }
    parts.push({ text: fullMessage });

    const chat = ai.chats.create({
      model: MODEL_CHAT,
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: appTools
      },
      history: history.map(h => ({
        role: h.role,
        parts: h.parts
      }))
    });

    const resultStream = await chat.sendMessageStream({
      message: parts
    });

    for await (const chunk of resultStream) {
      yield chunk;
    }

  } catch (error) {
    const friendlyMsg = parseGeminiError(error);
    console.error("Chat Error:", friendlyMsg);
    throw new Error(friendlyMsg);
  }
};

export const getEditorSuggestions = async (text: string, task: SuggestionTask) => {
    try {
        const ai = getAiClient();
        let prompt = "";
        // For synonyms, we want a clean list
        if (task === 'synonyms') {
             prompt = `List 3 single-word synonyms for: "${text}". Return ONLY a JSON array of strings. Example: ["word1", "word2", "word3"]`;
        } 
        // For rewrites
        else if (task.startsWith('rewrite')) {
             let style = "descriptive and engaging";
             if (task === 'rewrite_formal') style = "more formal and professional";
             if (task === 'rewrite_casual') style = "casual and conversational";
             if (task === 'rewrite_short') style = "concise and shorter (summarize)";
             if (task === 'rewrite_detailed') style = "more detailed, descriptive, and vivid";
             
             prompt = `Rewrite the following text to be ${style}. Do not add unnecessary fluff unless requested. Return ONLY the rewritten text. Text: "${text}"`;
        }
        // Grammar
        else {
             prompt = `Fix grammar and spelling. Return ONLY the corrected text. Text: "${text}"`;
        }

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: prompt,
            config: task === 'synonyms' ? { responseMimeType: 'application/json' } : undefined
        });
        
        return response.text?.trim();
    } catch (e) {
        console.error("Suggestion Error:", parseGeminiError(e));
        return null;
    }
}

export const analyzeDraft = async (text: string): Promise<AnalysisResult | null> => {
  try {
    const ai = getAiClient();
    // Optimization: Don't analyze massive texts all at once
    const textToAnalyze = text.substring(0, 5000);

    const prompt = `Analyze the text for tone, emotion, and grammar.
      Return a JSON object:
      {
        "tone": "string (Describe the tone in 1-5 words, e.g. 'Dark and Mysterious')",
        "emotion": [{"name": "string", "score": number}],
        "suggestions": ["string", "string", "string"],
        "highlightCandidates": [
            { "substring": "exact text segment", "type": "emotion" | "grammar", "label": "Short explanation (e.g. 'Passive voice', 'Expresses joy')" }
        ]
      }
      For 'emotion', return at least 3 emotions with scores (0.0 to 1.0).
      For 'highlightCandidates', find 1-3 segments that clearly demonstrate a strong emotion or grammar issue.
      Text: "${textToAnalyze}"`;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        responseMimeType: "application/json" 
      }
    });
    
    let jsonStr = response.text || '{}';
    // Cleanup markdown if present
    jsonStr = jsonStr.replace(/```json\n?|```/g, '').trim();
    
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error in Analyze:", e);
        return null;
    }

    // Map substrings to indices
    const highlights: Highlight[] = [];
    if (parsed.highlightCandidates && Array.isArray(parsed.highlightCandidates)) {
        parsed.highlightCandidates.forEach((h: any) => {
            if (!h.substring) return;
            // Find first occurrence of substring
            const start = text.indexOf(h.substring);
            if (start !== -1) {
                highlights.push({
                    start: start,
                    end: start + h.substring.length,
                    type: h.type || 'emotion',
                    label: h.label || 'Note',
                    color: h.type === 'grammar' ? '#fca5a5' : '#bae6fd' 
                });
            }
        });
    }

    return {
      tone: parsed.tone || 'Neutral',
      emotion: Array.isArray(parsed.emotion) ? parsed.emotion : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      highlights: highlights
    };

  } catch (error) {
    console.error("Analysis Error:", parseGeminiError(error));
    return null;
  }
};

export const generateCharacterProfile = async (currentSettings?: any, mode: 'create' | 'improve' = 'create') => {
  const ai = getAiClient();
  
  let prompt = "";
  if (mode === 'create') {
      prompt = `Create a unique, detailed Talkie character profile. 
      IMPORTANT: You MUST include a full 'draft_content' (at least 300 words) and at least 3 'world_items'. Do not leave these empty.
      Generate a compelling intro scene for the Draft tab and key lore for the World Codex.`;
  } else {
      prompt = `Improve and polish the following character profile. Make it deeper, more consistent, and more engaging.
      Current Profile: ${JSON.stringify(currentSettings)}
      IMPORTANT: You MUST include an improved version of 'draft_content' and 'world_items'. Do not leave them empty.`;
  }

  const responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        age: { type: Type.STRING },
        role: { type: Type.STRING },
        personality: { type: Type.STRING, description: 'Detailed personality description' },
        backstory: { type: Type.STRING, description: 'Detailed backstory' },
        biography: { type: Type.STRING, description: 'Short bio' },
        intro: { type: Type.STRING, description: 'Talkie app prompt' },
        draft_content: { type: Type.STRING, description: 'MANDATORY: A full introductory scene or story starter to be placed in the Draft tab. Approx 300 words.' },
        world_items: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    category: { type: Type.STRING, enum: ["Lore", "Location", "Relationship", "Magic"] },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING }
                }
            }
        }
      },
      required: ['name', 'role', 'personality', 'draft_content', 'world_items']
  };

  try {
      const response = await ai.models.generateContent({
          model: MODEL_CHAT,
          contents: prompt,
          config: { 
              responseMimeType: 'application/json',
              responseSchema: responseSchema
          }
      });
      return JSON.parse(response.text || '{}');
  } catch (e) {
      console.error("Gen Profile Error", e);
      return null;
  }
};

export const generateIntroStream = async function* (settings: any) {
  try {
    const ai = getAiClient();
    const prompt = `Create a compelling Talkie character intro/prompt (under 4000 chars) based on:
    Name: ${settings.name}
    Role: ${settings.role}
    Personality: ${settings.personality}
    Backstory: ${settings.backstory}
    Biography: ${settings.biography}
    
    Format nicely with a hook, description of appearance, and initial dialogue line.`;

    const stream = await ai.models.generateContentStream({
      model: MODEL_CHAT,
      contents: prompt
    });

    for await (const chunk of stream) {
        if (chunk.text) {
            yield chunk.text;
        }
    }
  } catch (error) {
    const friendlyMsg = parseGeminiError(error);
    console.error("Intro Generation Error:", friendlyMsg);
    throw new Error(friendlyMsg);
  }
};

export const generateSpeech = async (text: string, voiceName: string = 'Aoede'): Promise<AudioBuffer | null> => {
  try {
    const ai = getAiClient();
    // Optimization: Limit to first 600 characters for faster "read aloud" response
    const textToRead = text.length > 600 ? text.substring(0, 600) + "..." : text;

    const response = await ai.models.generateContent({
        model: MODEL_TTS,
        contents: {
            parts: [{ text: textToRead }] 
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName } 
                }
            }
        }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await pcmToAudioBuffer(
        decode(base64Audio),
        audioContext,
        24000, 
        1      
    );
    
    return audioBuffer;

  } catch (error) {
    console.error("TTS Error", parseGeminiError(error));
    return null;
  }
};
