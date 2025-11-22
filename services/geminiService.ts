import { GoogleGenAI as Engine, Type as T, Modality as M, FunctionDeclaration as FD, Tool as TL } from "@google/genai";
import { decode, pcmToAudioBuffer } from "./audioUtils";
import { SuggestionTask, AnalysisResult, Highlight } from "../types";

// -- CONFIGURATION --
const K = process.env.API_KEY;
const cx = () => new Engine({ apiKey: K });

// -- MODEL CONSTANTS --
const M_01 = 'gemini-2.5-flash';
const M_02 = 'gemini-2.5-flash'; 
const M_VOX = 'gemini-2.5-flash-preview-tts';

// -- SCHEMA DEFS --
const D_1: FD = {
  name: 'createFullCharacter',
  description: 'Generates entity.',
  parameters: {
    type: T.OBJECT,
    properties: {
      name: { type: T.STRING },
      role: { type: T.STRING },
      age: { type: T.STRING },
      personality: { type: T.STRING },
      backstory: { type: T.STRING },
      biography: { type: T.STRING },
      draft_intro: { type: T.STRING },
      world_lore: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: {
            category: { type: T.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
            title: { type: T.STRING },
            description: { type: T.STRING }
          }
        }
      }
    },
    required: ['name', 'role', 'personality', 'draft_intro', 'world_lore']
  }
};

const D_2: FD = {
  name: 'updateStory',
  description: 'Modifies buffer.',
  parameters: {
    type: T.OBJECT,
    properties: {
      text: { type: T.STRING },
      action: { type: T.STRING, enum: ['replace', 'append'] }
    },
    required: ['text']
  }
};

const D_3: FD = {
  name: 'updateCharacterProfile',
  description: 'Modifies state.',
  parameters: {
    type: T.OBJECT,
    properties: {
      field: { type: T.STRING, enum: ['name', 'role', 'age', 'personality', 'backstory', 'biography'] },
      value: { type: T.STRING }
    },
    required: ['field', 'value']
  }
};

const D_4: FD = {
  name: 'addWorldEntry',
  description: 'Appends db.',
  parameters: {
    type: T.OBJECT,
    properties: {
      category: { type: T.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
      title: { type: T.STRING },
      description: { type: T.STRING }
    },
    required: ['category', 'title', 'description']
  }
};

const SYS_0 = `You are 'Geny'.
Goal: Assist user.
Persona: Creative, low-pressure.
1. No illegal content.
2. Concise.
3. Use tools for updates.`;

export const toolSet: TL[] = [{
  functionDeclarations: [D_1, D_2, D_3, D_4]
}];

const _parseErr = (e: any): string => {
  const s = e?.message || String(e);
  if (s.includes('429')) return "Rate limit.";
  if (s.includes('503')) return "Service unavailable.";
  try {
      const j = JSON.parse(s);
      return j.error?.message || j.message || "Error";
  } catch {
      return "Unknown error";
  }
};

export const processStream = async function* (
  h: { role: string; parts: { text?: string; inlineData?: any }[] }[],
  msg: string,
  img?: string,
  ctx?: string
) {
  try {
    const c = cx();
    const p: any[] = [];
    if (img) {
      p.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
    }
    
    let input = msg;
    if (ctx) input = `[CTX]:\n${ctx.substring(0, 3000)}...\n\n[IN]: ${msg}`;
    p.push({ text: input });

    const chat = c.chats.create({
      model: M_01,
      config: { 
        systemInstruction: SYS_0,
        tools: toolSet,
        temperature: 1.1 
      },
      history: h.map(x => ({ role: x.role, parts: x.parts }))
    });

    const res = await chat.sendMessageStream({ message: p });
    for await (const chunk of res) {
      yield chunk;
    }
  } catch (e) {
    throw new Error(_parseErr(e));
  }
};

export const enhanceText = async (txt: string, t: SuggestionTask) => {
    try {
        const c = cx();
        let p = "";
        if (t === 'synonyms') {
             p = `List 3 synonyms: "${txt}". JSON array.`;
        } else if (t.startsWith('rewrite')) {
             let m = "engaging";
             if (t.includes('formal')) m = "formal";
             if (t.includes('casual')) m = "casual";
             if (t.includes('short')) m = "concise";
             if (t.includes('detailed')) m = "detailed";
             p = `Rewrite (${m}): "${txt}". Text only.`;
        } else {
             p = `Fix grammar: "${txt}". Text only.`;
        }

        const r = await c.models.generateContent({
            model: M_02,
            contents: p,
            config: t === 'synonyms' ? { responseMimeType: 'application/json' } : undefined
        });
        return r.text?.trim();
    } catch { return null; }
}

export const inspect = async (txt: string): Promise<AnalysisResult | null> => {
  try {
    const c = cx();
    const sub = txt.substring(0, 4000);
    const p = `Analyze. JSON: { "tone": "str", "emotion": [{"name":"str","score":num}], "suggestions": ["str"], "highlightCandidates": [{"substring":"str","type":"emotion"|"grammar","label":"str"}] }. Input: "${sub}"`;

    const r = await c.models.generateContent({
      model: M_02,
      contents: p,
      config: { responseMimeType: "application/json" }
    });
    
    let j = r.text || '{}';
    j = j.replace(/```json\n?|```/g, '').trim();
    const d = JSON.parse(j);

    const hls: Highlight[] = [];
    if (d.highlightCandidates?.length) {
        d.highlightCandidates.forEach((x: any) => {
            if (!x.substring) return;
            const s = txt.indexOf(x.substring);
            if (s !== -1) {
                hls.push({
                    start: s,
                    end: s + x.substring.length,
                    type: x.type || 'emotion',
                    label: x.label || 'Note',
                    color: x.type === 'grammar' ? '#fca5a5' : '#bae6fd' 
                });
            }
        });
    }

    return {
      tone: d.tone || 'Neutral',
      emotion: d.emotion || [],
      suggestions: d.suggestions || [],
      highlights: hls
    };
  } catch { return null; }
};

export const construct = async (curr?: any, m: 'create' | 'improve' = 'create', desc?: string) => {
  const c = cx();
  let p = m === 'create' 
    ? `Create profile: "${desc || 'random'}". Include 'draft_content' & 'world_items'.`
    : `Improve: ${JSON.stringify(curr)}. Note: "${desc}". Include 'draft_content' & 'world_items'.`;

  const schema = {
      type: T.OBJECT,
      properties: {
        name: { type: T.STRING },
        age: { type: T.STRING },
        role: { type: T.STRING },
        personality: { type: T.STRING },
        backstory: { type: T.STRING },
        biography: { type: T.STRING },
        intro: { type: T.STRING },
        draft_content: { type: T.STRING },
        world_items: {
            type: T.ARRAY,
            items: {
                type: T.OBJECT,
                properties: {
                    category: { type: T.STRING, enum: ["Lore", "Location", "Relationship", "Magic"] },
                    title: { type: T.STRING },
                    description: { type: T.STRING }
                }
            }
        }
      },
      required: ['name', 'role', 'personality', 'draft_content', 'world_items']
  };

  try {
      const r = await c.models.generateContent({
          model: M_01,
          contents: p,
          config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 1.1 }
      });
      return JSON.parse(r.text || '{}');
  } catch { return null; }
};

export const optimize = async (s: any, d: string) => {
  const c = cx();
  const sys = `Format to prompt structure.`; 
  const u = `SETTINGS:\n${JSON.stringify(s)}\nDRAFT:\n${d}`;
  try {
      const r = await c.models.generateContent({
          model: M_01,
          contents: [{ text: sys }, { text: u }],
          config: { temperature: 0.5 }
      });
      return r.text || '';
  } catch { return "Error."; }
};

export const synthesis = async (txt: string, v: string = 'Aoede'): Promise<AudioBuffer | null> => {
  try {
    const c = cx();
    const t = txt.length > 600 ? txt.substring(0, 600) + "..." : txt;
    const r = await c.models.generateContent({
        model: M_VOX,
        contents: { parts: [{ text: t }] },
        config: {
            responseModalities: [M.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } }
        }
    });
    const b = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b) return null;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return await pcmToAudioBuffer(decode(b), ctx, 24000, 1);
  } catch { return null; }
};