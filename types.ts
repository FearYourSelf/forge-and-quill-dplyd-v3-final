
export enum ViewMode {
  EDITOR = 'EDITOR',
  WORLDBUILDING = 'WORLDBUILDING',
  SETTINGS = 'SETTINGS',
  LIVE_SESSION = 'LIVE_SESSION'
}

export interface CharacterSettings {
  name: string;
  age: string;
  role: string;
  personality: string;
  backstory: string;
  biography: string;
}

export interface WorldItem {
  id: string;
  category: 'Lore' | 'Location' | 'Relationship' | 'Magic';
  title: string;
  description: string;
}

export interface Highlight {
  start: number;
  end: number;
  type: 'emotion' | 'grammar';
  label: string; // e.g. "Joy", "Typo"
  color: string;
}

export interface AnalysisResult {
  tone: string;
  emotion: { name: string; score: number }[]; // e.g., Happy: 0.8
  suggestions: string[];
  highlights: Highlight[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64
  isThinking?: boolean;
}

export interface AppState {
  id: string; // Unique ID for persistence
  draft: string;
  settings: CharacterSettings;
  worldItems: WorldItem[];
  generatedIntro: string | null;
  lastSaved?: string; // ISO Date string
}

export type ToolCallHandler = (toolName: string, args: any) => void;

export type SuggestionTask = 'grammar' | 'synonyms' | 'rewrite' | 'rewrite_formal' | 'rewrite_casual' | 'rewrite_short' | 'rewrite_detailed';
