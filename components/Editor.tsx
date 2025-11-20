import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, SpellCheck, Repeat, Loader2, Undo, Redo, ChevronRight, Info, Eye, EyeOff } from 'lucide-react';
import { getEditorSuggestions } from '../services/geminiService';
import { SuggestionTask, Highlight } from '../types';

interface EditorProps {
  content: string;
  onChange: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  highlights?: Highlight[];
}

const Editor: React.FC<EditorProps> = ({ content, onChange, onUndo, onRedo, canUndo, canRedo, highlights = [] }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'none' | 'rewrite' | 'synonyms'>('none');
  const [synonymList, setSynonymList] = useState<string[]>([]);
  const [isInspectMode, setIsInspectMode] = useState(false);
  
  // Highlight Tooltip State
  const [hoveredHighlight, setHoveredHighlight] = useState<Highlight | null>(null);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);

  // Sync Scroll
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleSelect = () => {
    const el = textareaRef.current;
    if (!el || isInspectMode) return;

    // Small delay to ensure selection is completed
    setTimeout(() => {
        if (el.selectionStart !== el.selectionEnd) {
            const text = el.value.substring(el.selectionStart, el.selectionEnd);
            if (!text.trim()) return;

            setSelection({
                start: el.selectionStart,
                end: el.selectionEnd,
                text
            });
            // Show menu fixed at top center of the component
            setMenuPosition({ top: 0, left: 0 }); 
            setActiveSubmenu('none');
            setSynonymList([]);
        } else {
            setMenuPosition(null);
            setSelection(null);
        }
    }, 10);
  };

  const handleApplyText = (newText: string) => {
      if (!selection) return;
      
      // Preserve original whitespace logic
      const leadingSpace = selection.text.match(/^\s*/)?.[0] || '';
      const trailingSpace = selection.text.match(/\s*$/)?.[0] || '';
      const replacement = leadingSpace + newText.trim() + trailingSpace;

      const fullText = content.substring(0, selection.start) + replacement + content.substring(selection.end);
      onChange(fullText);
      setMenuPosition(null);
      setSelection(null);
  };

  const fetchSuggestion = async (task: SuggestionTask) => {
    if (!selection) return;
    setIsProcessing(true);
    
    const result = await getEditorSuggestions(selection.text, task);
    setIsProcessing(false);

    if (result) {
        if (task === 'synonyms') {
            try {
                const list = JSON.parse(result);
                if (Array.isArray(list)) {
                    setSynonymList(list);
                    setActiveSubmenu('synonyms');
                }
            } catch (e) {
                console.error("Failed to parse synonyms", e);
            }
        } else {
            handleApplyText(result);
        }
    }
  };

  const handleHighlightHover = (e: React.MouseEvent, highlight: Highlight) => {
      if (!isInspectMode) return;
      setHoveredHighlight(highlight);
      setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleHighlightMove = (e: React.MouseEvent) => {
      if(isInspectMode && hoveredHighlight) {
          setMousePos({ x: e.clientX, y: e.clientY });
      }
  };

  const handleHighlightLeave = () => {
      setHoveredHighlight(null);
      setMousePos(null);
  };

  const renderHighlights = () => {
      if (!highlights.length) return <span className={isInspectMode ? 'opacity-30 blur-[0.5px] transition-all duration-500' : ''}>{content + '\n'}</span>;

      let lastIndex = 0;
      const fragments = [];
      const sorted = [...highlights].sort((a, b) => a.start - b.start);

      sorted.forEach((h, i) => {
          if (h.start < lastIndex) return; 
          
          // Non-highlighted segment (Apply fade if in focus mode)
          const plainText = content.substring(lastIndex, h.start);
          if (plainText) {
              fragments.push(
                  <span key={`plain-${i}`} className={`transition-all duration-500 ${isInspectMode ? 'opacity-30 blur-[0.5px]' : ''}`}>
                      {plainText}
                  </span>
              );
          }
          
          const text = content.substring(h.start, h.end);
          
          // More transparent background for realistic effect
          // Grammar (Red) or Emotion (Blue)
          const bgColor = h.type === 'grammar' 
            ? 'rgba(248, 113, 113, 0.25)' 
            : 'rgba(56, 189, 248, 0.25)';
          
          // Border for structure
          const borderColor = h.type === 'grammar' 
            ? 'rgba(248, 113, 113, 0.6)' 
            : 'rgba(56, 189, 248, 0.6)';

          fragments.push(
              <span 
                  key={i} 
                  className={`relative rounded-sm mix-blend-multiply dark:mix-blend-screen ${isInspectMode ? 'cursor-help z-20 opacity-100 scale-[1.02] shadow-sm' : ''} transition-all duration-300`}
                  style={{ 
                      backgroundColor: bgColor, 
                      borderBottom: `2px solid ${borderColor}`,
                      boxShadow: isInspectMode ? `0 0 8px ${bgColor}` : 'none'
                  }}
                  onMouseEnter={(e) => handleHighlightHover(e, h)}
                  onMouseMove={handleHighlightMove}
                  onMouseLeave={handleHighlightLeave}
              >
                  {text}
              </span>
          );
          
          lastIndex = h.end;
      });

      // Final plain segment
      const remaining = content.substring(lastIndex);
      if (remaining) {
          fragments.push(
            <span key="plain-end" className={`transition-all duration-500 ${isInspectMode ? 'opacity-30 blur-[0.5px]' : ''}`}>
                {remaining}
            </span>
          );
      }
      fragments.push('\n'); 

      return fragments;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-transparent relative flex flex-col transition-colors duration-700">
        
        {/* Toolbar Overlay */}
        <div className="sticky top-0 z-20 bg-paper/90 dark:bg-paper-dark/90 backdrop-blur-md px-8 py-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center transition-colors duration-700">
             
             {/* Analysis Legend - Only Visible in Inspect Mode */}
             <div className={`flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 transition-opacity duration-300 ${isInspectMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-sky-400/50 border border-sky-300 dark:border-sky-700"></div>
                    <span>Emotion</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-400/50 border border-red-300 dark:border-red-700"></div>
                    <span>Grammar/Issue</span>
                </div>
             </div>

             <div className="flex gap-2">
                <button 
                    onClick={() => setIsInspectMode(!isInspectMode)}
                    className={`p-2 rounded-lg transition-colors ${isInspectMode ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                    title={isInspectMode ? "Exit Inspect Mode" : "Inspect Highlights"}
                >
                    {isInspectMode ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 transition-colors duration-700"></div>
                <button 
                    onClick={onUndo} disabled={!canUndo}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg disabled:opacity-30 transition-colors"
                    title="Undo"
                >
                    <Undo size={18} />
                </button>
                <button 
                    onClick={onRedo} disabled={!canRedo}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg disabled:opacity-30 transition-colors"
                    title="Redo"
                >
                    <Redo size={18} />
                </button>
             </div>
        </div>

        {/* Tooltip - Rendered via Portal to escape parent scaling transforms */}
        {isInspectMode && hoveredHighlight && mousePos && createPortal(
             <div 
                className="fixed z-[9999] px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-xl pointer-events-none animate-in fade-in duration-150"
                style={{ top: mousePos.y + 5, left: mousePos.x + 5 }}
             >
                  <div className="font-bold uppercase opacity-75 mb-0.5">{hoveredHighlight.type}</div>
                  <div>{hoveredHighlight.label}</div>
             </div>,
             document.body
        )}

        {/* Floating Menu (Text Edit) */}
        {menuPosition && selection && !isInspectMode && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-40 bg-white dark:bg-surface-dark shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden text-gray-800 dark:text-gray-200">
                {isProcessing ? (
                     <div className="px-4 py-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 min-w-[150px] justify-center">
                        <Loader2 className="animate-spin" size={16} />
                        Refining...
                     </div>
                ) : (
                    <>
                        {activeSubmenu === 'none' && (
                            <div className="flex items-center p-1">
                                <button 
                                    onClick={() => fetchSuggestion('grammar')}
                                    className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                                >
                                    <SpellCheck size={16} className="text-blue-500 dark:text-blue-400" />
                                    Fix
                                </button>
                                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                <button 
                                     onClick={() => setActiveSubmenu('rewrite')}
                                     className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                                >
                                    <Wand2 size={16} className="text-purple-500 dark:text-purple-400" />
                                    Rewrite
                                    <ChevronRight size={14} className="text-gray-400" />
                                </button>
                                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                <button 
                                     onClick={() => fetchSuggestion('synonyms')}
                                     className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                                >
                                    <Repeat size={16} className="text-green-500 dark:text-green-400" />
                                    Synonyms
                                </button>
                            </div>
                        )}

                        {activeSubmenu === 'rewrite' && (
                             <div className="flex flex-col p-1 w-40">
                                <button onClick={() => fetchSuggestion('rewrite_short')} className="px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Shorten</button>
                                <button onClick={() => fetchSuggestion('rewrite_detailed')} className="px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Detailed</button>
                                <button onClick={() => fetchSuggestion('rewrite_formal')} className="px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Formal</button>
                                <button onClick={() => fetchSuggestion('rewrite_casual')} className="px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Casual</button>
                                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                <button onClick={() => setActiveSubmenu('none')} className="px-3 py-1 text-center text-xs text-gray-400 hover:text-gray-600">Back</button>
                             </div>
                        )}

                         {activeSubmenu === 'synonyms' && (
                             <div className="flex flex-col p-1 w-40">
                                {synonymList.map((word, i) => (
                                    <button key={i} onClick={() => handleApplyText(word)} className="px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium">{word}</button>
                                ))}
                                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                <button onClick={() => setActiveSubmenu('none')} className="px-3 py-1 text-center text-xs text-gray-400 hover:text-gray-600">Back</button>
                             </div>
                        )}
                    </>
                )}
            </div>
        )}

        <div className="max-w-3xl mx-auto px-8 pb-12 w-full flex-1 relative">
            {/* Highlighting Underlay / Readable Text Layer in Inspect Mode */}
            <div 
                ref={backdropRef}
                className={`absolute inset-0 px-8 pb-12 w-full h-full whitespace-pre-wrap font-serif text-lg leading-relaxed overflow-hidden transition-colors duration-700 ${isInspectMode ? 'text-ink dark:text-ink-dark pointer-events-auto z-10' : 'text-transparent pointer-events-none'}`}
                aria-hidden="true"
            >
                {renderHighlights()}
            </div>

            {/* Actual Textarea */}
            <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onChange(e.target.value)}
                onSelect={handleSelect}
                onScroll={handleScroll}
                placeholder="Start forging your story here..."
                className={`absolute inset-0 px-8 pb-12 w-full h-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none font-serif text-lg text-ink dark:text-ink-dark leading-relaxed placeholder:text-gray-300 dark:placeholder:text-gray-700 selection:bg-amber-200 dark:selection:bg-amber-900 selection:text-amber-900 dark:selection:text-amber-100 transition-colors duration-700 ${isInspectMode ? 'opacity-0 pointer-events-none' : ''}`}
                spellCheck={false}
                disabled={isInspectMode}
            />
        </div>
    </div>
  );
};

export default Editor;