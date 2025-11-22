import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, Bot, Feather, Mic, Settings as SettingsIcon, Sliders, 
  Volume2, Plus, Trash2, Check, Download, Moon, Sun, 
  X, Play, Square, FolderOpen, FilePlus, Save, 
  AlertTriangle, Loader2, Info, Bug, Layout, Maximize2, Minimize2,
  PanelRightClose, PanelRightOpen, Globe, Sparkles, Terminal, VolumeX, ArrowLeftRight,
  Flame, PenTool, Copy, Wand2, CheckCircle2
} from 'lucide-react';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import ToneAnalyzer from './components/ToneAnalyzer';
import LiveSession from './components/LiveSession';
import WalkthroughOverlay, { TourStep } from './components/WalkthroughOverlay';
import CharacterCompare from './components/CharacterCompare';
import AppSettingsModal from './components/AppSettingsModal';
import { ViewMode, AppState, WorldItem, AnalysisResult, CharacterSettings, Highlight } from './types';
import { construct, synthesis, inspect, optimize } from './services/geminiService';

const ExpandableInput = ({ label, name, value, onChange, onExpand, placeholder, className }: any) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="relative group">
          <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                      onClick={handleCopy}
                      className="text-gray-400 hover:text-accent p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Copy"
                  >
                     {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                  <button 
                      onClick={() => onExpand({name, value})}
                      className="text-gray-400 hover:text-accent p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Maximize"
                  >
                      <Maximize2 size={14} />
                  </button>
              </div>
          </div>
          <textarea 
            name={name} 
            value={value} 
            onChange={onChange}
            className={className}
            placeholder={placeholder}
          />
      </div>
    );
};

const App: React.FC = () => {
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const loadInitialState = (): AppState => {
      let latestChar: AppState | null = null;
      let latestTime = 0;

      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('fq_char_')) {
              try {
                  const char = JSON.parse(localStorage.getItem(key) || '');
                  const time = char.lastSaved ? new Date(char.lastSaved).getTime() : 0;
                  if (time > latestTime) {
                      latestTime = time;
                      latestChar = char;
                  }
              } catch (e) {
                  // ignore
              }
          }
      }

      if (latestChar) {
          return latestChar;
      }

      return {
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
      };
  };

  const [state, setState] = useState<AppState>(loadInitialState);

  const [appSettings, setAppSettings] = useState({
      debugMode: false,
      autoSave: true,
      voiceLive: 'Aoede',
      voiceTTS: 'Aoede'
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [history, setHistory] = useState<AppState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [view, setView] = useState<ViewMode>(ViewMode.EDITOR);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false); 
  const [toast, setToast] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const filesMenuRef = useRef<HTMLDivElement>(null);
  const [savedCharacters, setSavedCharacters] = useState<AppState[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'disabled'>('saved');
  
  const [isComparing, setIsComparing] = useState(false);

  const [showGenConfirm, setShowGenConfirm] = useState(false);

  const [aiCreatorInput, setAiCreatorInput] = useState('');

  const [showLiveSession, setShowLiveSession] = useState(false);

  const [expandedField, setExpandedField] = useState<{name: string, value: string} | null>(null);

  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [demoSelection, setDemoSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [isIntroAnimating, setIsIntroAnimating] = useState(false);

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const [isAddingWorldItem, setIsAddingWorldItem] = useState(false);
  const [newWorldItem, setNewWorldItem] = useState<Partial<WorldItem>>({ category: 'Lore', title: '', description: '' });

  const [isPromptCopied, setIsPromptCopied] = useState(false);

  useEffect(() => {
      const hasSeen = localStorage.getItem('fq_has_seen_tutorial');
      if (!hasSeen) {
          setShowWalkthrough(true);
      }
      setHistory([state]);
      setHistoryIndex(0);
  }, []);

  const handleCloseWalkthrough = () => {
      setShowWalkthrough(false);
      localStorage.setItem('fq_has_seen_tutorial', 'true');
      setIsSidebarOpen(false); 
      
      setDemoSelection(null);
      setIsInspectMode(false);
      
      setState(prev => ({ ...prev, draft: '' }));
      handleIntroAnimation();
  };

  const handleIntroAnimation = () => {
      setView(ViewMode.EDITOR);
      setIsIntroAnimating(true);
      setTimeout(() => {
          setIsIntroAnimating(false);
      }, 4000);
  };

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (filesMenuRef.current && !filesMenuRef.current.contains(event.target as Node)) {
              setIsFileMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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

  const loadSavedCharacters = () => {
      const chars: AppState[] = [];
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('fq_char_')) {
              try {
                  const char = JSON.parse(localStorage.getItem(key) || '');
                  chars.push(char);
              } catch (e) {
                  // ignore
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
      setAiCreatorInput('');
      showToast("Created");
  };

  const handleLoadCharacter = (char: AppState) => {
      setState(char);
      setHistory([char]);
      setHistoryIndex(0);
      setIsFileMenuOpen(false);
      setAiCreatorInput('');
      showToast(`Loaded ${char.settings.name || 'Untitled'}`);
  };

  const handleDeleteCharacter = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      localStorage.removeItem(`fq_char_${id}`);
      loadSavedCharacters();
      showToast("Deleted");
  };

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

  const showToast = (message: string) => {
      setToast(message);
      setTimeout(() => setToast(null), 3000);
  };

  const runAnalysis = async () => {
      const fullContext = [
          state.draft,
          state.settings.personality ? `[P]: ${state.settings.personality}` : '',
          state.settings.backstory ? `[B]: ${state.settings.backstory}` : '',
          state.settings.biography ? `[Bio]: ${state.settings.biography}` : ''
      ].filter(Boolean).join('\n\n');

      if (!fullContext || fullContext.length < 10) return; 
      
      setIsAnalyzing(true);
      const res = await inspect(fullContext);
      if (res) setAnalysisResult(res);
      setIsAnalyzing(false);
  };

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

  const handleOptimizedPromptGeneration = async () => {
      setIsGenerating(true);
      try {
          const optimizedPrompt = await optimize(state.settings, state.draft);
          setState(prev => ({ ...prev, generatedIntro: optimizedPrompt }));
          saveToHistory({ ...state, generatedIntro: optimizedPrompt });
          showToast("Optimized!");
      } catch (e) {
          showToast("Failed");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleCopyPrompt = () => {
      if(state.generatedIntro) {
          navigator.clipboard.writeText(state.generatedIntro);
          setIsPromptCopied(true);
          setTimeout(() => setIsPromptCopied(false), 2000);
          showToast("Copied");
      }
  }

  const handleAICreatorAction = () => {
      if (state.settings.name || state.settings.role) {
          setShowGenConfirm(true);
      } else {
          handleCharacterGeneration('create');
      }
  };

  const handleCharacterGeneration = async (mode: 'create' | 'improve') => {
    setIsGenerating(true);
    setShowGenConfirm(false);
    try {
      const result = await construct(mode === 'improve' ? state.settings : undefined, mode, aiCreatorInput);
      
      if (result) {
          const newSettings = {
              name: result.name || state.settings.name,
              role: result.role || state.settings.role,
              age: result.age || state.settings.age,
              personality: result.personality || state.settings.personality,
              backstory: result.backstory || state.settings.backstory,
              biography: result.biography || state.settings.biography
          };

          let newDraft = state.draft;
          if (result.draft_content) {
              if (mode === 'create') {
                  newDraft = result.draft_content;
              } else {
                  newDraft = state.draft + "\n\n" + result.draft_content;
              }
          }

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
          showToast(mode === 'create' ? "Created" : "Polished");
          setAiCreatorInput(''); 
      }
    } catch (err) {
      showToast("Failed");
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
      const buffer = await synthesis(state.draft, appSettings.voiceTTS);
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
      const buffer = await synthesis(text, voiceName);
      
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
          showToast("Failed");
      }
  };
  
  const handleExport = () => {
    const { settings, draft } = state;
    const content = `EXPORT...\n${settings.name}\n${draft}`; 
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.name || 'talkie'}_export.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported");
  };

  const handleToolCall = (toolName: string, args: any) => {
      saveToHistory(state);
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

  const tourSteps: TourStep[] = useMemo(() => [
    {
      targetSelector: '.tour-nav-dock, .tour-nav-draft', 
      title: "Navigation",
      description: "Switch tabs here.",
      position: 'right',
      onStepEnter: () => setView(ViewMode.EDITOR)
    },
    {
      targetSelector: '#editor-scroller',
      title: "Draft",
      description: "Your writing space.",
      position: 'left',
      onStepEnter: () => {
          setView(ViewMode.EDITOR);
          setDemoSelection(null);
          setIsInspectMode(false);
          setState(prev => ({ ...prev, draft: '' })); 
      }
    },
    {
        targetSelector: '.tour-nav-world',
        title: "World",
        description: "Create lore.",
        position: 'right',
        onStepEnter: () => {
            setView(ViewMode.WORLDBUILDING);
        }
    },
    {
        targetSelector: '.tour-inspect-container',
        title: "Inspect",
        description: (
            <span>
                Detects issues automatically.
            </span>
        ),
        position: 'bottom',
        onStepEnter: () => {
            setView(ViewMode.EDITOR);
            setTimeout(() => {
                setState(prev => ({ ...prev, draft: "I am so hapy that the darknes is gone." }));
                setIsInspectMode(true);
                setAnalysisResult({
                    tone: 'Hopeful',
                    emotion: [{name: 'Joy', score: 0.9}],
                    suggestions: [],
                    highlights: [
                        { start: 8, end: 12, type: 'grammar', label: 'Typo', color: '#fca5a5' }, 
                        { start: 22, end: 29, type: 'grammar', label: 'Typo', color: '#fca5a5' } 
                    ]
                });
            }, 100);
        }
    },
    {
        targetSelector: '#floating-menu', 
        title: "Tools",
        description: "Highlight text to access tools.",
        position: 'bottom',
        onStepEnter: () => {
            setIsInspectMode(false);
            const text = "The city was big.";
            setState(prev => ({ ...prev, draft: text }));
            setTimeout(() => {
                setDemoSelection({ start: 13, end: 16, text: "big" });
            }, 100);
        }
    },
    {
        targetSelector: '.tour-nav-settings',
        title: "Settings",
        description: "Define character core.",
        position: 'right',
        onStepEnter: () => {
            setDemoSelection(null);
            setView(ViewMode.SETTINGS);
        }
    },
    {
        targetSelector: '#tour-talkie-creator',
        title: "Creator",
        description: "Auto-generate profiles.",
        position: 'left',
        onStepEnter: () => setView(ViewMode.SETTINGS)
    },
    {
        targetSelector: '.tour-tone-analyzer',
        title: "Analysis",
        description: "See tone metrics.",
        position: 'left',
        onStepEnter: () => setView(ViewMode.SETTINGS)
    },
    {
        targetSelector: '#tour-geny-toggle',
        title: "Assistant",
        description: "Chat with the bot.",
        position: 'left',
        onStepEnter: () => { setIsSidebarOpen(true); }
    },
    {
        targetSelector: '.tour-nav-voice',
        title: "Voice",
        description: "Real-time chat.",
        position: 'right',
        onStepEnter: () => { setIsSidebarOpen(false); }
    }
  ], []);

  const NavButton = ({ mode, icon: Icon, label, className }: { mode: ViewMode, icon: any, label: string, className?: string }) => (
        <button 
            className={`relative group p-3 rounded-xl transition-all duration-300 flex justify-center w-full ${className || ''}
                ${view === mode 
                    ? 'text-white bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-amber-500/30' 
                    : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'
                }`}
            onClick={() => setView(mode)}
        >
            <Icon size={20} strokeWidth={view === mode ? 2.5 : 2} />
            {view === mode && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-1 h-8 bg-white/50 rounded-r-full hidden md:block"></span>
            )}
            <div className="hidden md:block absolute left-full ml-4 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-50">
                {label}
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
            </div>
        </button>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans bg-[#f3f4f6] dark:bg-[#09090b] text-gray-900 dark:text-gray-100 transition-colors duration-700 ease-in-out relative selection:bg-accent/30 selection:text-accent-900">
      
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-accent/5 dark:bg-accent/10 rounded-full blur-[120px] animate-aurora opacity-50"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-400/5 dark:bg-blue-600/10 rounded-full blur-[100px] animate-aurora delay-1000 opacity-50"></div>
      </div>

      {showWalkthrough && <WalkthroughOverlay steps={tourSteps} onClose={handleCloseWalkthrough} onComplete={handleCloseWalkthrough} />}
      {isComparing && <CharacterCompare savedCharacters={savedCharacters} onClose={() => setIsComparing(false)} />}
      <AppSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={appSettings}
        onSettingsChange={setAppSettings}
        onVoicePreview={handleVoicePreview}
        onShowTutorial={() => { setShowWalkthrough(true); setIsSettingsOpen(false); }}
        isPreviewPlaying={isPreviewPlaying}
      />

      {expandedField && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-3xl bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-bold text-lg uppercase tracking-wider text-gray-500">{expandedField.name.replace(/_/g, ' ')}</h3>
                    <button onClick={() => setExpandedField(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Minimize2 size={20}/></button>
                </div>
                <textarea 
                    value={expandedField.value}
                    onChange={(e) => {
                        setExpandedField({...expandedField, value: e.target.value});
                        setState(prev => ({ ...prev, settings: { ...prev.settings, [expandedField.name]: e.target.value } }));
                    }}
                    className="flex-1 p-6 bg-transparent resize-none focus:outline-none font-serif text-lg leading-relaxed"
                />
            </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <div id="tour-dock" className={`
          tour-nav-dock hidden md:flex relative z-40 w-20 h-full flex-col items-center py-6 bg-white/60 dark:bg-black/40 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-800/50 transition-all duration-500 ease-in-out
          ${isFocusMode ? '-translate-x-full w-0 opacity-0' : 'translate-x-0 opacity-100'}
      `}>
          <div className="mb-8 w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white relative group cursor-default overflow-hidden animate-float">
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Flame size={20} className="absolute bottom-2 right-2 text-yellow-200 opacity-60 animate-flicker" />
              <PenTool size={22} className="relative z-10 drop-shadow-sm -translate-x-1 -translate-y-1" strokeWidth={2.5} />
          </div>
          <div className="flex-1 w-full px-3 flex flex-col gap-2">
              <NavButton className="tour-nav-draft" mode={ViewMode.EDITOR} icon={Feather} label="Draft" />
              <NavButton className="tour-nav-settings" mode={ViewMode.SETTINGS} icon={Sliders} label="Settings" />
              <NavButton className="tour-nav-world" mode={ViewMode.WORLDBUILDING} icon={Globe} label="World" />
          </div>
          <div className="w-full px-3 flex flex-col gap-3 mt-auto">
             <div className="w-full h-px bg-gray-200 dark:bg-gray-800"></div>
             <div className="relative group w-full flex justify-center">
                <button 
                    onClick={() => setShowLiveSession(true)}
                    className="tour-nav-voice p-3 rounded-xl transition-colors flex justify-center w-full text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                    <Mic size={20} />
                </button>
             </div>
             <div className="relative group w-full flex justify-center">
                <button 
                   onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                   className={`p-3 rounded-xl transition-colors flex justify-center w-full ${isFileMenuOpen ? 'text-accent bg-amber-50 dark:bg-amber-900/20' : 'text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}
                >
                    <FolderOpen size={20} />
                </button>
                {isFileMenuOpen && (
                    <div ref={filesMenuRef} className="absolute left-14 bottom-0 w-64 bg-white dark:bg-surface-dark rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 z-50 animate-in slide-in-from-left-2 fade-in duration-200">
                        <div className="flex justify-between items-center px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                            <span className="text-xs font-bold text-gray-500 uppercase">Saved</span>
                            <button onClick={handleNewCharacter} className="text-accent hover:text-amber-600 p-1" title="New"><FilePlus size={16}/></button>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {savedCharacters.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">No saved</div>}
                            {savedCharacters.map(char => (
                                <div key={char.id} onClick={() => handleLoadCharacter(char)} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm ${state.id === char.id ? 'bg-accent/10 text-accent' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                    <span className="truncate flex-1">{char.settings.name || 'Untitled'}</span>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[10px] text-gray-400">{new Date(char.lastSaved || '').toLocaleDateString()}</span>
                                        <button onClick={(e) => handleDeleteCharacter(char.id, e)} className="text-gray-400 hover:text-red-500"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2">
                             <button onClick={() => setIsComparing(true)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
                                 <ArrowLeftRight size={14} /> Compare
                             </button>
                        </div>
                    </div>
                )}
             </div>
             <div className="relative group w-full flex justify-center">
                 <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-3 rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors flex justify-center w-full"
                 >
                    <SettingsIcon size={20} />
                 </button>
             </div>
             <div className="relative group w-full flex justify-center">
                 <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-3 rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors flex justify-center w-full"
                 >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                 </button>
             </div>
          </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/80 dark:bg-surface-dark/90 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 z-[60] flex justify-around items-center px-2">
           <NavButton className="tour-nav-draft" mode={ViewMode.EDITOR} icon={Feather} label="Draft" />
           <NavButton className="tour-nav-settings" mode={ViewMode.SETTINGS} icon={Sliders} label="Settings" />
           <button 
                onClick={() => setShowLiveSession(true)}
                className="tour-nav-voice p-3 -mt-6 bg-accent text-white rounded-full shadow-lg shadow-accent/30 border-4 border-[#f3f4f6] dark:border-[#09090b]"
            >
                <Mic size={24} />
           </button>
           <NavButton className="tour-nav-world" mode={ViewMode.WORLDBUILDING} icon={Globe} label="World" />
           <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
           >
                <SettingsIcon size={20} />
           </button>
      </div>

      <div className="flex-1 flex h-full overflow-hidden relative z-0">
          
          <div className="flex-1 h-full relative flex flex-col overflow-hidden transition-all duration-500 pb-20 md:pb-0">
              
              <div className={`w-full px-4 md:px-8 py-4 flex justify-between items-center z-30 transition-all duration-500 ${isFocusMode ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'}`}>
                  <div className="flex-1 min-w-0 mr-4">
                      <h1 className="font-serif text-xl md:text-2xl font-bold text-gray-800 dark:text-white tracking-tight truncate">
                          {(state.settings.name || 'Untitled')}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 font-medium mt-1">
                            <span className="flex items-center gap-1">
                                {autoSaveStatus === 'saving' && <Loader2 size={10} className="animate-spin"/>}
                                {autoSaveStatus === 'saved' ? 'Saved' : autoSaveStatus === 'saving' ? 'Saving...' : 'Off'}
                            </span>
                            <span className="text-gray-600 dark:text-gray-500">•</span>
                            <span>Last edited {state.lastSaved ? new Date(state.lastSaved).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
                      </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                      <button 
                          onClick={handleReadAloud}
                          className={`p-2 rounded-full transition-all ${isReadingAloud ? 'bg-accent text-white animate-pulse' : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                          title="Read"
                      >
                          {isReadingAloud ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                      <button 
                          onClick={() => setIsFocusMode(!isFocusMode)}
                          className={`hidden md:flex p-2 rounded-full transition-all ${isFocusMode ? 'bg-accent text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                          title="Focus"
                      >
                          {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                      </button>
                      <button 
                          onClick={handleExport}
                          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                          <Download size={14} /> Export
                      </button>
                      <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
                      <button 
                            id="tour-geny-toggle"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`relative p-1 rounded-full transition-all duration-300 ${isSidebarOpen ? 'bg-accent shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700'}`}
                            title={isSidebarOpen ? "Close" : "Open"}
                      >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white dark:bg-gray-900 ${isSidebarOpen ? 'text-accent' : 'text-gray-500 dark:text-gray-400'} ${!isSidebarOpen ? 'animate-pulse-glow' : ''}`}>
                             <Bot size={18} />
                          </div>
                          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 ${isSidebarOpen ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      </button>
                  </div>
              </div>

              <div className="flex-1 relative overflow-hidden">
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
                                isInspectMode={isInspectMode}
                                onToggleInspectMode={() => setIsInspectMode(!isInspectMode)}
                                demoSelection={demoSelection}
                                isIntroAnimating={isIntroAnimating}
                              />
                          </div>
                      </div>
                  )}

                  {view === ViewMode.SETTINGS && (
                      <div className="h-full w-full flex justify-center overflow-hidden pb-4 pt-4">
                          <div className="w-full max-w-6xl px-4 md:px-8 h-full flex flex-col">
                             <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 h-full overflow-y-auto lg:overflow-hidden">
                                 
                                 <div className="lg:col-span-2 lg:h-full lg:overflow-y-auto pr-2 pb-6 lg:pb-20 order-2 lg:order-1">
                                    <div className="mb-8 flex items-center gap-3">
                                        <Sliders className="text-accent" size={28} />
                                        <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">Profile</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <ExpandableInput 
                                            label="Name" name="name" placeholder="e.g. Lyra"
                                            value={state.settings.name} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-accent focus:outline-none py-2 text-lg font-serif"
                                        />
                                        <ExpandableInput 
                                            label="Age" name="age" placeholder="e.g. 24"
                                            value={state.settings.age} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-accent focus:outline-none py-2 text-lg font-serif"
                                        />
                                    </div>
                                    <div className="mb-6">
                                        <ExpandableInput 
                                            label="Role" name="role" placeholder="e.g. Hero"
                                            value={state.settings.role} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 text-sm border border-transparent focus:border-accent focus:outline-none"
                                        />
                                    </div>
                                    <div className="space-y-6">
                                        <ExpandableInput 
                                            label="Personality" name="personality" placeholder="Traits..."
                                            value={state.settings.personality} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 min-h-[100px] text-sm border border-transparent focus:border-accent focus:outline-none resize-none"
                                        />
                                        <ExpandableInput 
                                            label="Backstory" name="backstory" placeholder="Origin..."
                                            value={state.settings.backstory} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 min-h-[120px] text-sm border border-transparent focus:border-accent focus:outline-none resize-none"
                                        />
                                        <ExpandableInput 
                                            label="Biography" name="biography" placeholder="Short bio..."
                                            value={state.settings.biography} onChange={handleSettingsChange} onExpand={setExpandedField}
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 min-h-[80px] text-sm border border-transparent focus:border-accent focus:outline-none resize-none"
                                        />
                                    </div>

                                    <section className="space-y-2 mt-8 mb-20">
                                          <div className="flex justify-between items-center mb-2">
                                              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                  <Terminal size={14} className="text-accent" /> Optimized Prompt
                                              </label>
                                              {state.generatedIntro && (
                                                  <button 
                                                      onClick={handleCopyPrompt}
                                                      className="text-gray-400 hover:text-accent p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                  >
                                                      {isPromptCopied ? <Check size={14} className="text-green-500"/> : <Copy size={14}/>}
                                                  </button>
                                              )}
                                          </div>
                                          <textarea 
                                              readOnly
                                              value={state.generatedIntro || ''}
                                              placeholder="Generate to create."
                                              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 h-48 focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none text-sm leading-relaxed"
                                          />
                                          <button 
                                              onClick={handleOptimizedPromptGeneration} disabled={isGenerating}
                                              className="w-full mt-2 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all"
                                          >
                                              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                              Generate
                                          </button>
                                      </section>
                                 </div>

                                 <div className="flex lg:col-span-1 flex-col gap-4 pb-20 lg:pb-6 lg:h-full lg:overflow-y-auto mt-6 lg:mt-0 order-1 lg:order-2 shrink-0 scrollbar-hide">
                                      
                                      <div id="tour-talkie-creator" className="shrink-0 bg-white dark:bg-gray-800/50 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                                          <div className="flex justify-between items-center mb-3">
                                              <h3 className="text-sm font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                                                  <Bot size={16} /> Creator
                                              </h3>
                                          </div>
                                          <textarea 
                                            value={aiCreatorInput}
                                            onChange={(e) => setAiCreatorInput(e.target.value)}
                                            placeholder="Describe character..."
                                            className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-3 h-24 resize-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all placeholder:text-gray-400"
                                          />
                                          <button 
                                            onClick={handleAICreatorAction}
                                            disabled={isGenerating || !aiCreatorInput.trim()}
                                            className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-accent/20"
                                          >
                                              {isGenerating ? 'Working...' : 'Create'}
                                          </button>
                                      </div>

                                      <div className="tour-tone-analyzer flex-1 min-h-[400px]">
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
                                <div className="tour-world-header flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                                  <div>
                                      <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">Codex</h2>
                                      <p className="text-gray-500 dark:text-gray-400 mt-1">Lore database.</p>
                                  </div>
                                  <button 
                                    onClick={() => setIsAddingWorldItem(true)}
                                    className="w-full sm:w-auto px-4 py-2 bg-accent hover:bg-amber-700 text-white rounded-lg shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 font-medium"
                                  >
                                      <Plus size={18} /> Add
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
                                            placeholder="Title"
                                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-accent"
                                          />
                                      </div>
                                      <textarea 
                                          value={newWorldItem.description}
                                          onChange={e => setNewWorldItem({...newWorldItem, description: e.target.value})}
                                          placeholder="Details..."
                                          className="w-full h-24 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-accent mb-4 resize-none"
                                      />
                                      <div className="flex justify-end gap-2">
                                          <button onClick={() => setIsAddingWorldItem(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                                          <button onClick={handleAddWorldItem} className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg font-medium">Save</button>
                                      </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {state.worldItems.length === 0 && !isAddingWorldItem && (
                                      <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                                          <Globe size={48} className="mx-auto text-gray-300 mb-4" />
                                          <p className="text-gray-400 font-medium">Empty.</p>
                                          <button onClick={() => setIsAddingWorldItem(true)} className="mt-2 text-accent hover:underline">Create entry</button>
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

                  {showLiveSession && (
                      <LiveSession 
                        onClose={() => setShowLiveSession(false)} 
                        onToolCall={handleToolCall} 
                        currentContext={state} 
                        voiceName={appSettings.voiceLive} 
                      />
                  )}
              </div>
          </div>

          <div className={`
              hidden md:block relative h-full bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out overflow-hidden
              ${isSidebarOpen && !isFocusMode ? 'w-80 translate-x-0 opacity-0' : 'w-0 translate-x-full opacity-0'}
          `} style={{ opacity: isSidebarOpen && !isFocusMode ? 1 : 0 }}>
              <div className="absolute inset-0 w-80">
                <Sidebar 
                    isOpen={isSidebarOpen} 
                    draftContext={state.draft} 
                    onToolCall={handleToolCall} 
                    debugMode={appSettings.debugMode}
                    onStartLive={() => setShowLiveSession(true)}
                />
              </div>
          </div>
      </div>

      <div className={`
          md:hidden fixed inset-0 z-[100] pointer-events-none
          ${isSidebarOpen ? 'pointer-events-auto' : ''}
      `}>
          <div 
              className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} 
              onClick={() => setIsSidebarOpen(false)}
          />
          <div className={`
              absolute right-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-white dark:bg-surface-dark shadow-2xl transition-transform duration-300 ease-out h-[calc(100dvh)]
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
                    onStartLive={() => setShowLiveSession(true)}
                  />
              </div>
          </div>
      </div>
    </div>
  );
};

export default App;