
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  BookOpen, Bot, Feather, Mic, Settings as SettingsIcon, Sliders, 
  Volume2, Plus, Trash2, Check, Download, Moon, Sun, 
  X, Play, Square, FolderOpen, FilePlus, Save, 
  AlertTriangle, Loader2, Info, Bug, Layout, Maximize2, Minimize2,
  PanelRightClose, PanelRightOpen, Globe, Sparkles, Terminal, VolumeX, ArrowLeftRight,
  Flame, PenTool
} from 'lucide-react';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import ToneAnalyzer from './components/ToneAnalyzer';
import LiveSession from './components/LiveSession';
import OnboardingOverlay from './components/OnboardingOverlay';
import CharacterCompare from './components/CharacterCompare';
import AppSettingsModal from './components/AppSettingsModal';
import { ViewMode, AppState, WorldItem, AnalysisResult, CharacterSettings } from './types';
import { generateCharacterProfile, generateSpeech, analyzeDraft } from './services/geminiService';

const App: React.FC = () => {
  // Generate a simple ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const [state, setState] = useState<AppState>({
    id: generateId(),
    draft: '',
    settings: {
      name: '',
      role: '',
      personality: '',
      backstory: '',
      biography: '',
      age: ''
    },
    worldItems: [],
    generatedIntro: null,
    lastSaved: undefined
  });

  // App Settings
  const [appSettings, setAppSettings] = useState({
      debugMode: false,
      autoSave: true,
      voiceLive: 'Aoede',
      voiceTTS: 'Aoede'
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Shared Analysis State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // History for Undo/Redo
  const [history, setHistory] = useState<AppState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [view, setView] = useState<ViewMode>(ViewMode.EDITOR);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false); // For Voice Preview
  const [toast, setToast] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  // File Management State
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const filesMenuRef = useRef<HTMLDivElement>(null);
  const [savedCharacters, setSavedCharacters] = useState<AppState[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'disabled'>('saved');
  
  // Comparison State
  const [isComparing, setIsComparing] = useState(false);

  // AI Confirm Modal
  const [showGenConfirm, setShowGenConfirm] = useState(false);

  // Expanded Field Modal
  const [expandedField, setExpandedField] = useState<{name: string, value: string} | null>(null);

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Audio Source Ref for Stopping TTS
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Worldbuilding state
  const [isAddingWorldItem, setIsAddingWorldItem] = useState(false);
  const [newWorldItem, setNewWorldItem] = useState<Partial<WorldItem>>({ category: 'Lore', title: '', description: '' });

  // Initial Check for Onboarding
  useEffect(() => {
      const hasSeen = localStorage.getItem('fq_has_seen_tutorial');
      if (!hasSeen) {
          setShowOnboarding(true);
      }
  }, []);

  const handleCloseOnboarding = () => {
      setShowOnboarding(false);
      localStorage.setItem('fq_has_seen_tutorial', 'true');
  };

  // Click Outside for Files Menu
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (filesMenuRef.current && !filesMenuRef.current.contains(event.target as Node)) {
              setIsFileMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dark Mode Toggle
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Auto-Save Logic
  useEffect(() => {
      if (!appSettings.autoSave) {
          setAutoSaveStatus('disabled');
          return;
      }

      setAutoSaveStatus('saving');
      const timer = setTimeout(() => {
          const timestamp = new Date().toISOString();
          const stateToSave = { ...state, lastSaved: timestamp };
          localStorage.setItem(`fq_char_${state.id}`, JSON.stringify(stateToSave));
          setState(prev => ({ ...prev, lastSaved: timestamp }));
          setAutoSaveStatus('saved');
      }, 2000);

      return () => clearTimeout(timer);
  }, [state.draft, state.settings, state.worldItems, state.generatedIntro, appSettings.autoSave]);

  // Load saved characters list
  const loadSavedCharacters = () => {
      const chars: AppState[] = [];
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('fq_char_')) {
              try {
                  const char = JSON.parse(localStorage.getItem(key) || '');
                  chars.push(char);
              } catch (e) {
                  console.error("Failed to load char", key);
              }
          }
      }
      setSavedCharacters(chars.sort((a, b) => (b.lastSaved || '').localeCompare(a.lastSaved || '')));
  };

  useEffect(() => {
      if (isFileMenuOpen || isComparing) {
          loadSavedCharacters();
      }
  }, [isFileMenuOpen, isComparing]);

  const handleNewCharacter = () => {
      const newState: AppState = {
        id: generateId(),
        draft: '',
        settings: { name: '', role: '', personality: '', backstory: '', biography: '', age: '' },
        worldItems: [],
        generatedIntro: null,
        lastSaved: new Date().toISOString()
      };
      setState(newState);
      setHistory([newState]);
      setHistoryIndex(0);
      setIsFileMenuOpen(false);
      showToast("New Talkie created");
  };

  const handleLoadCharacter = (char: AppState) => {
      setState(char);
      setHistory([char]);
      setHistoryIndex(0);
      setIsFileMenuOpen(false);
      showToast(`Loaded ${char.settings.name || 'Untitled'}`);
  };

  const handleDeleteCharacter = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      localStorage.removeItem(`fq_char_${id}`);
      loadSavedCharacters();
      showToast("Talkie deleted");
  };

  // Undo/Redo Logic
  const saveToHistory = useCallback((newState: AppState) => {
      setHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          return [...newHistory, newState];
      });
      setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const handleUndo = () => {
      if (historyIndex > 0) {
          setHistoryIndex(prev => prev - 1);
          setState(history[historyIndex - 1]);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          setHistoryIndex(prev => prev + 1);
          setState(history[historyIndex + 1]);
      }
  };

  useEffect(() => {
      if (history.length === 0) {
          setHistory([state]);
          setHistoryIndex(0);
      }
  }, []);

  const showToast = (message: string) => {
      setToast(message);
      setTimeout(() => setToast(null), 3000);
  };

  // Analyze Logic
  const runAnalysis = async () => {
      // Combine Draft content with relevant character settings to give full context
      const fullContext = [
          state.draft,
          state.settings.personality ? `[Personality]: ${state.settings.personality}` : '',
          state.settings.backstory ? `[Backstory]: ${state.settings.backstory}` : '',
          state.settings.biography ? `[Biography]: ${state.settings.biography}` : ''
      ].filter(Boolean).join('\n\n');

      if (!fullContext || fullContext.length < 10) return; 
      
      setIsAnalyzing(true);
      const res = await analyzeDraft(fullContext);
      if (res) setAnalysisResult(res);
      setIsAnalyzing(false);
  };

  // Handlers
  const handleDraftChange = (text: string) => {
    const newState = { ...state, draft: text };
    setState(newState);
    if (analysisResult?.highlights?.length) {
        setAnalysisResult(prev => prev ? ({ ...prev, highlights: [] }) : null);
    }
  };

  useEffect(() => {
      const timer = setTimeout(() => {
          if (history[historyIndex] !== state) {
              saveToHistory(state);
          }
          if (state.draft.length > 10 || state.settings.personality) { 
              runAnalysis();
          }
      }, 1500); 
      return () => clearTimeout(timer);
  }, [state.draft, state.settings]);

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, [name]: value }
    }));
  };

  const handleGenClick = () => {
      // Check if main fields are populated
      const hasContent = state.settings.name || state.settings.personality || state.settings.backstory;
      if (hasContent) {
          setShowGenConfirm(true);
      } else {
          handleCharacterGeneration('create');
      }
  };

  const handleCharacterGeneration = async (mode: 'create' | 'improve') => {
    setIsGenerating(true);
    setShowGenConfirm(false);
    try {
      const result = await generateCharacterProfile(mode === 'improve' ? state.settings : undefined, mode);
      
      if (result) {
          const newSettings = {
              name: result.name || state.settings.name,
              role: result.role || state.settings.role,
              age: result.age || state.settings.age,
              personality: result.personality || state.settings.personality,
              backstory: result.backstory || state.settings.backstory,
              biography: result.biography || state.settings.biography
          };

          // Handle draft update if provided
          let newDraft = state.draft;
          if (result.draft_content) {
              if (mode === 'create') {
                  newDraft = result.draft_content;
              } else {
                  // Append if optimizing
                  newDraft = state.draft + "\n\n" + result.draft_content;
              }
          }

          // Handle world items if provided
          let newWorldItems = [...state.worldItems];
          if (result.world_items && Array.isArray(result.world_items)) {
              const items = result.world_items.map((item: any) => ({
                  ...item,
                  id: generateId()
              }));
              if (mode === 'create') {
                  newWorldItems = items;
              } else {
                  newWorldItems = [...newWorldItems, ...items];
              }
          }

          const newState = {
              ...state,
              generatedIntro: result.intro || state.generatedIntro,
              settings: newSettings,
              draft: newDraft,
              worldItems: newWorldItems
          };

          setState(newState);
          saveToHistory(newState);
          showToast(mode === 'create' ? "Character Created" : "Character Polished");
      }
    } catch (err) {
      console.error(err);
      showToast("Generation Failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReadAloud = async () => {
      if (isReadingAloud) {
          if (audioSourceRef.current) {
              audioSourceRef.current.stop();
              audioSourceRef.current = null;
          }
          setIsReadingAloud(false);
          return;
      }
      if(!state.draft) return;
      setIsReadingAloud(true);
      const buffer = await generateSpeech(state.draft, appSettings.voiceTTS);
      if(buffer) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
          audioSourceRef.current = source;
          source.onended = () => {
              setIsReadingAloud(false);
              audioSourceRef.current = null;
          };
      } else {
          setIsReadingAloud(false);
      }
  };

  const handleVoicePreview = async (voiceName: string) => {
      if (isPreviewPlaying) {
          if (previewSourceRef.current) {
              previewSourceRef.current.stop();
              previewSourceRef.current = null;
          }
          setIsPreviewPlaying(false);
          return;
      }

      setIsPreviewPlaying(true);
      const text = "Hi there! What would you like to talk about today?";
      const buffer = await generateSpeech(text, voiceName);
      
      if(buffer) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
          previewSourceRef.current = source;
          source.onended = () => {
              setIsPreviewPlaying(false);
              previewSourceRef.current = null;
          };
      } else {
          setIsPreviewPlaying(false);
          showToast("Failed to generate preview");
      }
  };
  
  const handleExport = () => {
    const { settings, draft, generatedIntro, worldItems } = state;
    const content = `FORGE & QUILL EXPORT
    
TALKIE PROFILE
Name: ${settings.name}
Role: ${settings.role}
Age: ${settings.age}
Personality: ${settings.personality}
Backstory: ${settings.backstory}
Biography: ${settings.biography}

---
TALKIE PROMPT
${generatedIntro || '(Not generated)'}

---
STORY DRAFT
${draft}

---
WORLD & LORE
${worldItems.map(w => `[${w.category}] ${w.title}: ${w.description}`).join('\n')}
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.name || 'talkie'}_export.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported to text file");
  };

  const handleToolCall = (toolName: string, args: any) => {
      saveToHistory(state);
      
      if (toolName === 'createFullCharacter') {
          const { name, role, age, personality, backstory, biography, draft_intro, world_lore } = args;
          
          const newWorldItems = Array.isArray(world_lore) 
              ? world_lore.map((item: any) => ({ ...item, id: generateId() })) 
              : [];

          setState(prev => ({
              ...prev,
              settings: {
                  name: name || prev.settings.name,
                  role: role || prev.settings.role,
                  age: age || prev.settings.age,
                  personality: personality || prev.settings.personality,
                  backstory: backstory || prev.settings.backstory,
                  biography: biography || prev.settings.biography
              },
              draft: draft_intro || prev.draft,
              worldItems: [...prev.worldItems, ...newWorldItems]
          }));
          showToast("Character Fully Created!");
      }
      else if (toolName === 'updateStory' || toolName === 'updateDraft') {
          const text = args.text;
          const action = args.action || 'append';
          setState(prev => {
              const newDraft = action === 'replace' ? text : prev.draft + (prev.draft ? '\n\n' : '') + text;
              return { ...prev, draft: newDraft };
          });
          showToast("Draft updated");
      }
      else if (toolName === 'updateCharacterProfile') {
          const { field, value } = args;
          if (field && value) {
              setState(prev => ({
                  ...prev,
                  settings: { ...prev.settings, [field]: value }
              }));
              showToast(`Updated ${field}`);
          }
      }
      else if (toolName === 'addWorldEntry') {
          const { category, title, description } = args;
          if(title && description) {
              setState(prev => ({
                  ...prev,
                  worldItems: [...prev.worldItems, {
                      id: generateId(),
                      category: category || 'Lore',
                      title,
                      description
                  }]
              }));
              showToast(`Added: ${title}`);
          }
      }
  };

  const handleAddWorldItem = () => {
      if(newWorldItem.title && newWorldItem.description) {
          const newState = {
              ...state,
              worldItems: [...state.worldItems, { ...newWorldItem, id: Date.now().toString() } as WorldItem]
          };
          setState(newState);
          saveToHistory(newState);
          setNewWorldItem({ category: 'Lore', title: '', description: '' });
          setIsAddingWorldItem(false);
      }
  };

  const handleDeleteWorldItem = (id: string) => {
      const newState = {
          ...state,
          worldItems: state.worldItems.filter(item => item.id !== id)
      };
      setState(newState);
      saveToHistory(newState);
  };

  // --- Components ---

  const NavButton = ({ mode, icon: Icon, label }: { mode: ViewMode, icon: any, label: string }) => (
        <button 
            onClick={() => setView(mode)}
            className={`relative group p-3 rounded-xl transition-all duration-300 flex justify-center w-full
                ${view === mode 
                    ? 'text-white bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-amber-500/30' 
                    : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'
                }`}
        >
            <Icon size={20} strokeWidth={view === mode ? 2.5 : 2} />
            
            {/* Active Marker (Desktop) */}
            {view === mode && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-1 h-8 bg-white/50 rounded-r-full hidden md:block"></span>
            )}
            
            {/* Hover Tooltip (Desktop) */}
            <div className="hidden md:block absolute left-full ml-4 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-50">
                {label}
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
            </div>
        </button>
  );

  const ExpandableInput = ({ label, name, value, placeholder, className }: any) => (
      <div className="relative group">
          <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
              <button 
                  onClick={() => setExpandedField({name, value})}
                  className="text-gray-400 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Expand"
              >
                  <Maximize2 size={14} />
              </button>
          </div>
          <textarea 
            name={name} 
            value={value} 
            onChange={handleSettingsChange}
            className={className}
            placeholder={placeholder}
          />
      </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans bg-[#f3f4f6] dark:bg-[#09090b] text-gray-900 dark:text-gray-100 transition-colors duration-700 ease-in-out relative selection:bg-accent/30 selection:text-accent-900">
      
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-accent/5 dark:bg-accent/10 rounded-full blur-[120px] animate-aurora opacity-50"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-400/5 dark:bg-blue-600/10 rounded-full blur-[100px] animate-aurora delay-1000 opacity-50"></div>
      </div>

      {/* Onboarding */}
      {showOnboarding && <OnboardingOverlay onClose={handleCloseOnboarding} />}

      {/* Comparison Modal */}
      {isComparing && <CharacterCompare savedCharacters={savedCharacters} onClose={() => setIsComparing(false)} />}
      
      {/* App Settings Modal */}
      <AppSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={appSettings}
        onSettingsChange={setAppSettings}
        onVoicePreview={handleVoicePreview}
        onShowTutorial={() => { setShowOnboarding(true); setIsSettingsOpen(false); }}
        isPreviewPlaying={isPreviewPlaying}
      />

      {/* Expanded Field Modal */}
      {expandedField && (
           <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-gray-900 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col animate-in zoom-in-95 duration-200">
                   <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                       <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 uppercase tracking-wide">{expandedField.name}</h3>
                       <button onClick={() => setExpandedField(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                           <Minimize2 size={20} className="text-gray-500" />
                       </button>
                   </div>
                   <textarea 
                        className="flex-1 w-full p-8 resize-none focus:outline-none bg-transparent text-lg font-serif leading-relaxed text-gray-800 dark:text-gray-200"
                        value={state.settings[expandedField.name as keyof CharacterSettings] as string}
                        onChange={handleSettingsChange}
                        name={expandedField.name}
                        autoFocus
                   />
                   <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                       <button onClick={() => setExpandedField(null)} className="px-6 py-2 bg-accent text-white rounded-lg font-medium hover:bg-amber-700 transition-colors">
                           Done
                       </button>
                   </div>
               </div>
           </div>
      )}

      {/* Generation Confirmation Modal */}
      {showGenConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200">
                  <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Character Generation</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                      You already have character details filled out. How would you like to proceed?
                  </p>
                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => handleCharacterGeneration('improve')}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-accent text-white rounded-xl font-medium hover:bg-amber-700 transition-colors"
                      >
                          <Sparkles size={18} />
                          Polished & Improve Existing
                      </button>
                      <button 
                        onClick={() => handleCharacterGeneration('create')}
                        className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-xl font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                          Overwrite All Fields
                      </button>
                      <button 
                        onClick={() => setShowGenConfirm(false)}
                        className="w-full py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-medium"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Toast */}
      {toast && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] bg-white/90 dark:bg-gray-800/90 backdrop-blur shadow-xl border border-gray-200 dark:border-gray-700 px-6 py-3 rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check size={14} className="text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{toast}</span>
          </div>
      )}

      {/* --- LEFT DOCK (Desktop Only) --- */}
      <div className={`
          hidden md:flex relative z-40 w-20 h-full flex-col items-center py-6 bg-white/60 dark:bg-black/40 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-800/50 transition-all duration-500 ease-in-out
          ${isFocusMode ? '-translate-x-full w-0 opacity-0' : 'translate-x-0 opacity-100'}
      `}>
          {/* New Logo Composition: Flame & Quill with Golden Theme & Animations */}
          <div className="mb-8 w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white relative group cursor-default overflow-hidden animate-float">
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Flame size={20} className="absolute bottom-2 right-2 text-yellow-200 opacity-60 animate-flicker" />
              <PenTool size={22} className="relative z-10 drop-shadow-sm -translate-x-1 -translate-y-1" strokeWidth={2.5} />
          </div>

          <div className="flex-1 w-full px-3 flex flex-col gap-2">
              <NavButton mode={ViewMode.EDITOR} icon={Feather} label="Draft" />
              <NavButton mode={ViewMode.SETTINGS} icon={Sliders} label="Character Settings" />
              <NavButton mode={ViewMode.WORLDBUILDING} icon={Globe} label="Worldbuilding" />
          </div>

          <div className="w-full px-3 flex flex-col gap-3 mt-auto">
             <div className="w-full h-px bg-gray-200 dark:bg-gray-800"></div>
             
             <div className="relative group w-full flex justify-center">
                <button 
                    onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                    className={`p-3 rounded-xl transition-colors flex justify-center relative w-full
                        ${isFileMenuOpen ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'}
                    `}
                >
                    <FolderOpen size={20} />
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-50">
                    Saved Talkies
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                </div>

                {/* Files Menu Dropdown */}
                {isFileMenuOpen && (
                    <div ref={filesMenuRef} className="absolute bottom-0 left-16 w-64 bg-white dark:bg-gray-900 shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 p-2 z-50 animate-in fade-in slide-in-from-left-2">
                        <div className="flex justify-between items-center px-2 py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
                            <span className="text-xs font-bold uppercase text-gray-500">Saved Talkies</span>
                            <button onClick={handleNewCharacter} className="text-accent hover:underline text-xs flex items-center gap-1"><Plus size={12}/> New</button>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-1 mb-2">
                            {savedCharacters.length === 0 && <div className="text-xs text-gray-400 p-2 text-center">No saved characters</div>}
                            {savedCharacters.map(char => (
                                <div key={char.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg group cursor-pointer" onClick={(e) => handleLoadCharacter(char)}>
                                    <div className="truncate flex-1 text-sm">
                                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{char.settings.name || 'Untitled'}</div>
                                        <div className="text-[10px] text-gray-400">{new Date(char.lastSaved || '').toLocaleDateString()}</div>
                                    </div>
                                    <button onClick={(e) => handleDeleteCharacter(char.id, e)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                        
                        {/* Compare Button */}
                        <button 
                           onClick={() => { setIsFileMenuOpen(false); setIsComparing(true); }}
                           className="w-full py-2 px-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                           <ArrowLeftRight size={14} /> Compare Characters
                        </button>
                    </div>
                )}
             </div>
             
             <div className="relative group w-full flex justify-center">
                 <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className={`p-3 rounded-xl transition-colors flex justify-center w-full
                        ${isSettingsOpen 
                            ? 'text-white bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800' 
                            : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'}
                    `}
                 >
                     <SettingsIcon size={20} />
                 </button>
                 <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-50">
                    Settings
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                </div>
             </div>

             <div className="relative group w-full flex justify-center">
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-3 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors flex justify-center w-full"
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-50">
                    Theme
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                </div>
             </div>
          </div>
      </div>
      
      {/* --- BOTTOM NAV (Mobile Only) --- */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 z-[60] flex justify-around p-2 pb-safe`}>
           <NavButton mode={ViewMode.EDITOR} icon={Feather} label="Draft" />
           <NavButton mode={ViewMode.SETTINGS} icon={Sliders} label="Character Settings" />
           <NavButton mode={ViewMode.WORLDBUILDING} icon={Globe} label="Worldbuilding" />
           <button 
               onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
               className={`p-3 rounded-xl transition-colors ${isSettingsOpen ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}
           >
               <SettingsIcon size={20} />
           </button>
      </div>

      {/* --- MAIN CONTENT WRAPPER --- */}
      <div className="flex-1 flex h-full overflow-hidden relative z-0">
          
          {/* --- CENTER STAGE --- */}
          <div className="flex-1 h-full relative flex flex-col overflow-hidden transition-all duration-500 pb-20 md:pb-0">
              
              {/* Top Header */}
              <div className={`
                  w-full px-4 md:px-8 py-4 flex justify-between items-center z-30 transition-all duration-500
                  ${isFocusMode ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'}
              `}>
                  <div className="flex-1 min-w-0 mr-4">
                      <h1 className="font-serif text-xl md:text-2xl font-bold text-gray-800 dark:text-white tracking-tight truncate">
                          {(state.settings.name || 'Untitled Talkie')}
                      </h1>
                      <div className="flex items-center gap-2 text-xs text-gray-400 font-medium mt-1">
                            <span className={`flex items-center gap-1 ${autoSaveStatus === 'saving' ? 'text-accent' : ''}`}>
                                {autoSaveStatus === 'saving' && <Loader2 size={10} className="animate-spin" />}
                                {autoSaveStatus === 'saved' && <Check size={10} />}
                                {autoSaveStatus === 'disabled' && <AlertTriangle size={10} />}
                                {autoSaveStatus === 'saving' ? 'Saving...' : autoSaveStatus === 'disabled' ? 'Auto-save off' : 'Saved'}
                            </span>
                            {state.lastSaved && autoSaveStatus !== 'saving' && (
                                <>
                                    <span className="text-gray-300 dark:text-gray-700">•</span>
                                    <span>Last edited {new Date(state.lastSaved).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>
                                </>
                            )}
                            <span className="hidden md:inline text-gray-300 dark:text-gray-700 mx-1">•</span>
                            <span className="hidden md:inline opacity-40 hover:opacity-100 transition-opacity duration-300 text-[10px] font-mono uppercase tracking-wider">
                                Powered by <a href="https://www.talkie-ai.com/profile/notsodangerous-327065556930864" target="_blank" rel="noopener noreferrer" className="text-yellow-500/90 hover:text-yellow-400 hover:underline decoration-yellow-500/30 underline-offset-2 transition-colors">NSD-CORE/17B</a>
                            </span>
                      </div>
                  </div>

                  <div className="flex items-center gap-2 md:gap-3">
                      {view === ViewMode.EDITOR && (
                          <>
                            <button 
                                onClick={handleReadAloud}
                                className={`p-2 rounded-lg transition-all ${isReadingAloud ? 'bg-accent text-white shadow-lg shadow-accent/30 animate-pulse' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
                                title="Read Aloud"
                            >
                                {isReadingAloud ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                            </button>
                            <button 
                                onClick={() => setIsFocusMode(!isFocusMode)}
                                className={`hidden md:block p-2 rounded-lg transition-all ${isFocusMode ? 'bg-accent text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
                                title="Focus Mode"
                            >
                                <Maximize2 size={18} />
                            </button>
                          </>
                      )}
                      <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1 hidden md:block"></div>
                      <button 
                            onClick={handleExport}
                            className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-opacity"
                      >
                          <Download size={16} />
                          <span>Export</span>
                      </button>
                      
                      {/* Sidebar Toggle Button: Geny Avatar */}
                      <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`relative p-1 rounded-full transition-all duration-300 ${isSidebarOpen ? 'bg-accent shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700'}`}
                            title={isSidebarOpen ? "Close Geny" : "Open Geny"}
                      >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white dark:bg-gray-900 ${isSidebarOpen ? 'text-accent' : 'text-gray-500 dark:text-gray-400'}`}>
                             <Bot size={18} />
                          </div>
                          {/* Online indicator */}
                          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 ${isSidebarOpen ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      </button>
                  </div>
              </div>

              {/* Main Workspace Content */}
              <div className="flex-1 relative overflow-hidden">
                  {/* Focus Mode Exit Button (Floating) */}
                  {isFocusMode && (
                      <button 
                        onClick={() => setIsFocusMode(false)}
                        className="absolute top-6 right-6 z-50 p-3 bg-gray-900/10 dark:bg-white/10 hover:bg-gray-900/20 dark:hover:bg-white/20 backdrop-blur rounded-full text-gray-600 dark:text-gray-300 transition-all animate-in fade-in"
                      >
                          <Minimize2 size={20} />
                      </button>
                  )}

                  {view === ViewMode.EDITOR && (
                      <div className="h-full w-full flex justify-center overflow-y-auto scroll-smooth pb-20 pt-2" id="editor-scroller">
                          <div className={`
                              w-full max-w-[800px] min-h-[calc(100%-2rem)] mx-4
                              bg-paper dark:bg-[#121214] shadow-2xl shadow-gray-200/50 dark:shadow-black/50
                              transition-all duration-500 ease-out
                              ${isFocusMode ? 'scale-100 my-0 rounded-none' : 'scale-[0.98] my-4 rounded-xl border border-gray-100 dark:border-gray-800'}
                          `}>
                              <Editor 
                                content={state.draft} 
                                onChange={handleDraftChange}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                canUndo={historyIndex > 0}
                                canRedo={historyIndex < history.length - 1}
                                highlights={analysisResult?.highlights}
                              />
                          </div>
                      </div>
                  )}

                  {view === ViewMode.SETTINGS && (
                      <div className="h-full w-full flex justify-center overflow-hidden pb-4 pt-4">
                          <div className="w-full max-w-6xl px-4 md:px-8 h-full flex flex-col">
                              {/* Responsive Layout: Vertical Stack on Mobile, Split Pane on Desktop */}
                              <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 h-full overflow-y-auto lg:overflow-hidden">
                                  
                                  {/* Left Column - Form Inputs */}
                                  {/* Order-2 on mobile so AI tools can be Order-1 if desired, or Order-2 to be standard */}
                                  <div className="lg:col-span-2 lg:h-full lg:overflow-y-auto pr-2 pb-6 lg:pb-20 order-2 lg:order-1">
                                      <section className="space-y-4 mb-8">
                                          <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                              <Sliders className="text-accent" /> Character Profile
                                          </h2>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                              <div className="space-y-2">
                                                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Name</label>
                                                  <input 
                                                    name="name" value={state.settings.name} onChange={handleSettingsChange}
                                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                                                    placeholder="e.g. Lyra Silvertongue"
                                                  />
                                              </div>
                                              <div className="space-y-2">
                                                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Age</label>
                                                  <input 
                                                    name="age" value={state.settings.age} onChange={handleSettingsChange}
                                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                                                    placeholder="e.g. 24"
                                                  />
                                              </div>
                                              <div className="col-span-full space-y-2">
                                                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Role</label>
                                                  <input 
                                                    name="role" value={state.settings.role} onChange={handleSettingsChange}
                                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                                                    placeholder="e.g. Reluctant Hero, Cyberpunk Detective"
                                                  />
                                              </div>
                                          </div>
                                      </section>
                                      
                                      <section className="space-y-2 mb-6">
                                          <ExpandableInput 
                                            label="Personality"
                                            name="personality"
                                            value={state.settings.personality}
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 h-32 focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
                                            placeholder="Describe how they act, think, and feel..."
                                          />
                                      </section>

                                      <section className="space-y-2 mb-6">
                                          <ExpandableInput 
                                            label="Backstory"
                                            name="backstory"
                                            value={state.settings.backstory}
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 h-40 focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
                                            placeholder="Where do they come from? What shaped them?"
                                          />
                                      </section>

                                      <section className="space-y-2 mb-20">
                                          <ExpandableInput 
                                            label="Biography"
                                            name="biography"
                                            value={state.settings.biography}
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 h-24 focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
                                            placeholder="Short bio for the Talkie app card..."
                                          />
                                      </section>
                                  </div>

                                  {/* Right Column - AI Tools & Analytics */}
                                  {/* Mobile: Order-1 (Top) so users can easily generate. Desktop: Order-2 (Right side) */}
                                  <div className="flex lg:col-span-1 flex-col gap-6 pb-20 lg:pb-6 lg:h-full lg:overflow-hidden mt-6 lg:mt-0 order-1 lg:order-2 shrink-0">
                                      {/* AI Box */}
                                      <div className="shrink-0 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                                          <div className="flex items-center justify-between mb-4">
                                              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                  <Bot size={18} className="text-accent" /> AI Prompt
                                              </h3>
                                              <button 
                                                onClick={handleGenClick} disabled={isGenerating}
                                                className="text-xs bg-accent text-white px-3 py-1.5 rounded-full hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                                              >
                                                  {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Feather size={12} />}
                                                  Generate
                                              </button>
                                          </div>
                                          <div className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-black/20 p-4 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[100px] max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed italic">
                                              {state.generatedIntro || "Click 'Generate' to auto-create a character, draft intro, and world entries."}
                                          </div>
                                      </div>

                                      {/* Tone Analyzer - Fills remaining space on desktop */}
                                      <div className="flex-1 min-h-0 overflow-hidden">
                                        <ToneAnalyzer 
                                            draft={state.draft} 
                                            result={analysisResult} 
                                            onAnalyze={runAnalysis} 
                                            loading={isAnalyzing} 
                                        />
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {view === ViewMode.WORLDBUILDING && (
                      <div className="h-full w-full flex justify-center overflow-y-auto pb-20 pt-8">
                           <div className="w-full max-w-5xl px-4 md:px-8 animate-in fade-in zoom-in-95 duration-300">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                                  <div>
                                      <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">World Codex</h2>
                                      <p className="text-gray-500 dark:text-gray-400 mt-1">Define the lore, locations, and rules of your universe.</p>
                                  </div>
                                  <button 
                                    onClick={() => setIsAddingWorldItem(true)}
                                    className="w-full sm:w-auto px-4 py-2 bg-accent hover:bg-amber-700 text-white rounded-lg shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 font-medium"
                                  >
                                      <Plus size={18} /> Add Entry
                                  </button>
                              </div>

                              {isAddingWorldItem && (
                                  <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 animate-in slide-in-from-top-4">
                                      <div className="flex flex-col sm:flex-row gap-4 mb-4">
                                          <select 
                                            value={newWorldItem.category}
                                            onChange={e => setNewWorldItem({...newWorldItem, category: e.target.value as any})}
                                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
                                          >
                                              <option>Lore</option>
                                              <option>Location</option>
                                              <option>Relationship</option>
                                              <option>Magic</option>
                                          </select>
                                          <input 
                                            value={newWorldItem.title}
                                            onChange={e => setNewWorldItem({...newWorldItem, title: e.target.value})}
                                            placeholder="Entry Title"
                                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent"
                                          />
                                      </div>
                                      <textarea 
                                          value={newWorldItem.description}
                                          onChange={e => setNewWorldItem({...newWorldItem, description: e.target.value})}
                                          placeholder="Description..."
                                          className="w-full h-24 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-accent mb-4 resize-none"
                                      />
                                      <div className="flex justify-end gap-2">
                                          <button onClick={() => setIsAddingWorldItem(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                                          <button onClick={handleAddWorldItem} className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg font-medium">Save Entry</button>
                                      </div>
                                  </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {state.worldItems.length === 0 && !isAddingWorldItem && (
                                      <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                                          <Globe size={48} className="mx-auto text-gray-300 mb-4" />
                                          <p className="text-gray-400 font-medium">No lore entries yet.</p>
                                          <button onClick={() => setIsAddingWorldItem(true)} className="mt-2 text-accent hover:underline">Create your first entry</button>
                                      </div>
                                  )}
                                  {state.worldItems.map(item => (
                                      <div key={item.id} className="group relative bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
                                          <button 
                                            onClick={() => handleDeleteWorldItem(item.id)}
                                            className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                          >
                                              <Trash2 size={14} />
                                          </button>
                                          <div className="text-[10px] font-bold tracking-wider text-accent uppercase mb-2">{item.category}</div>
                                          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">{item.title}</h3>
                                          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
                                      </div>
                                  ))}
                              </div>
                           </div>
                      </div>
                  )}

                  <LiveSession 
                    onClose={() => {}} 
                    onToolCall={handleToolCall} 
                    currentContext={state} 
                    voiceName={appSettings.voiceLive} 
                  />
              </div>
          </div>

          {/* --- RIGHT SIDEBAR (GENY) --- */}
          {/* Desktop Sidebar */}
          <div className={`
              hidden md:block relative h-full bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out overflow-hidden
              ${isSidebarOpen && !isFocusMode ? 'w-80 translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0'}
          `}>
              <div className="absolute inset-0 w-80">
                <Sidebar 
                    isOpen={isSidebarOpen} 
                    draftContext={state.draft} 
                    onToolCall={handleToolCall} 
                    debugMode={appSettings.debugMode}
                />
              </div>
          </div>

          {/* Mobile Sidebar (Overlay) */}
          <div className={`
              md:hidden fixed inset-0 z-[70] pointer-events-none
              ${isSidebarOpen ? 'pointer-events-auto' : ''}
          `}>
              {/* Backdrop */}
              <div 
                  className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} 
                  onClick={() => setIsSidebarOpen(false)}
              />
              {/* Sidebar Panel */}
              <div className={`
                  absolute right-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-white dark:bg-surface-dark shadow-2xl transition-transform duration-300 ease-out
                  ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
              `}>
                  <div className="h-full relative">
                      <button 
                          onClick={() => setIsSidebarOpen(false)} 
                          className="absolute top-4 right-4 z-50 p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500"
                      >
                          <PanelRightClose size={20} />
                      </button>
                      <Sidebar 
                        isOpen={isSidebarOpen} 
                        draftContext={state.draft} 
                        onToolCall={handleToolCall} 
                        debugMode={appSettings.debugMode}
                      />
                  </div>
              </div>
          </div>
          
      </div>
    </div>
  );
};

export default App;
