
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, SpellCheck, Repeat, Loader2, Undo, Redo, ChevronRight, Info, Eye, EyeOff, GripVertical } from 'lucide-react';
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
  isInspectMode: boolean;
  onToggleInspectMode: () => void;
  demoSelection?: { start: number; end: number; text: string } | null;
  isIntroAnimating?: boolean;
}

const Editor: React.FC<EditorProps> = ({ 
  content, 
  onChange, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo, 
  highlights = [],
  isInspectMode,
  onToggleInspectMode,
  demoSelection,
  isIntroAnimating
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [menuOffset, setMenuOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'none' | 'rewrite' | 'synonyms'>('none');
  const [synonymList, setSynonymList] = useState<string[]>([]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [hoveredHighlight, setHoveredHighlight] = useState<Highlight | null>(null);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);

  const [typewriterText, setTypewriterText] = useState('');
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
      if (isIntroAnimating) {
          const fullText = "Start forging your story here...";
          setTypewriterText('');
          setIsFadingOut(false);
          
          let i = 0;
          const interval = setInterval(() => {
              setTypewriterText(fullText.substring(0, i + 1));
              i++;
              if (i > fullText.length) {
                  clearInterval(interval);
                  setTimeout(() => setIsFadingOut(true), 100);
              }
          }, 50);
          return () => clearInterval(interval);
      } else {
          setIsFadingOut(false);
      }
  }, [isIntroAnimating]);

  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Handle Demo Selection Positioning with Safety Clamping
  useEffect(() => {
      if (demoSelection) {
          // Wait for render to find the span
          const timer = setTimeout(() => {
              const demoSpan = document.querySelector('.tour-demo-selection-text') as HTMLElement;
              if (demoSpan && textareaRef.current) {
                  const parentRect = textareaRef.current.parentElement?.getBoundingClientRect();
                  
                  if (parentRect) {
                    const top = demoSpan.offsetTop + demoSpan.offsetHeight + 10;
                    let left = demoSpan.offsetLeft;
                    
                    // --- CLAMPING / CENTERING LOGIC ---
                    const isMobile = window.innerWidth < 768;
                    const menuWidth = isMobile ? 250 : 300; 
                    const padding = isMobile ? 16 : 20;
                    const viewportWidth = window.innerWidth;
                    
                    if (isMobile) {
                        // ON MOBILE: Force center the menu relative to the screen
                        // Calculate the left position relative to the viewport
                        const screenCenterLeft = (viewportWidth - menuWidth) / 2;
                        // Convert to relative position inside the container
                        left = screenCenterLeft - parentRect.left;
                    } else {
                        // ON DESKTOP: Clamp to prevent overflow
                        // Calculate absolute left position (screen coords)
                        const absLeft = parentRect.left + left;
                        
                        if (absLeft + menuWidth > viewportWidth - padding) {
                             const diff = (absLeft + menuWidth) - (viewportWidth - padding);
                             left -= diff;
                        }
                        if (absLeft < padding) {
                             left += (padding - absLeft);
                        }
                    }

                    setMenuPosition({ top, left });
                    setSelection({ ...demoSelection });
                  }
              }
          }, 50);
          return () => clearTimeout(timer);
      } else if (!selection) {
          setMenuPosition(null);
      }
  }, [demoSelection, content]); 

  const measureSelection = (el: HTMLTextAreaElement) => {
      const div = document.createElement('div');
      const styles = window.getComputedStyle(el);
      
      div.style.position = 'absolute';
      div.style.top = '-9999px';
      div.style.left = '-9999px';
      div.style.visibility = 'hidden';
      div.style.width = styles.width;
      div.style.height = 'auto';
      div.style.font = styles.font;
      div.style.padding = styles.padding;
      div.style.paddingTop = styles.paddingTop;
      div.style.paddingLeft = styles.paddingLeft;
      div.style.border = styles.border;
      div.style.lineHeight = styles.lineHeight;
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordWrap = 'break-word';
      div.style.fontFamily = styles.fontFamily;
      div.style.fontSize = styles.fontSize;
      div.style.letterSpacing = styles.letterSpacing;
      div.style.boxSizing = styles.boxSizing;

      const text = el.value.substring(0, el.selectionEnd);
      div.textContent = text;
      
      const span = document.createElement('span');
      span.textContent = '|';
      div.appendChild(span);
      
      document.body.appendChild(div);
      
      const top = span.offsetTop;
      const left = span.offsetLeft;
      const lineHeight = parseInt(styles.lineHeight) || 24;

      document.body.removeChild(div);
      
      return { top, left, lineHeight };
  };

  const handleSelect = () => {
    const el = textareaRef.current;
    if (!el || isInspectMode || isDragging || demoSelection) return;

    setTimeout(() => {
        if (el.selectionStart !== el.selectionEnd) {
            const text = el.value.substring(el.selectionStart, el.selectionEnd);
            if (!text.trim()) return;

            const coords = measureSelection(el);
            const parentRect = el.parentElement?.getBoundingClientRect();

            // --- CLAMPING / CENTERING LOGIC FOR REAL SELECTION ---
            const isMobile = window.innerWidth < 768;
            const menuWidth = isMobile ? 250 : 300;
            const viewportWidth = window.innerWidth; 
            
            let leftPos = coords.left;
            
            if (isMobile && parentRect) {
                 // ON MOBILE: Force center
                 const screenLeft = (viewportWidth - menuWidth) / 2;
                 leftPos = screenLeft - parentRect.left;
            } else if (parentRect) {
                 // ON DESKTOP: Clamp
                 const absLeft = parentRect.left + leftPos;
                 const padding = 20;
                 if (absLeft + menuWidth > viewportWidth - padding) {
                     leftPos -= (absLeft + menuWidth - (viewportWidth - padding));
                 }
                 if (absLeft < padding) {
                     leftPos += (padding - absLeft);
                 }
            }

            setSelection({
                start: el.selectionStart,
                end: el.selectionEnd,
                text
            });
            
            setMenuPosition({ 
                top: coords.top + coords.lineHeight + 5, 
                left: leftPos 
            }); 
            setMenuOffset({ x: 0, y: 0 });
            setActiveSubmenu('none');
            setSynonymList([]);
        } else {
            setMenuPosition(null);
            setSelection(null);
        }
    }, 10);
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      setDragStart({ x: clientX, y: clientY });
  };

  useEffect(() => {
      const handleDrag = (e: MouseEvent | TouchEvent) => {
          if (!isDragging || !dragStart) return;
          
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
          
          const deltaX = clientX - dragStart.x;
          const deltaY = clientY - dragStart.y;
          
          setMenuOffset(prev => ({
              x: prev.x + deltaX,
              y: prev.y + deltaY
          }));
          
          setDragStart({ x: clientX, y: clientY });
      };

      const handleDragEnd = () => {
          setIsDragging(false);
          setDragStart(null);
      };

      if (isDragging) {
          window.addEventListener('mousemove', handleDrag);
          window.addEventListener('touchmove', handleDrag, { passive: false });
          window.addEventListener('mouseup', handleDragEnd);
          window.addEventListener('touchend', handleDragEnd);
      }
      return () => {
          window.removeEventListener('mousemove', handleDrag);
          window.removeEventListener('touchmove', handleDrag);
          window.removeEventListener('mouseup', handleDragEnd);
          window.removeEventListener('touchend', handleDragEnd);
      };
  }, [isDragging, dragStart]);

  const handleApplyText = (newText: string) => {
      if (!selection) return;
      
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

  const renderContent = () => {
      // Special rendering for Demo Selection (Blue fake highlight)
      if (demoSelection && !isInspectMode) {
          const pre = content.substring(0, demoSelection.start);
          const mid = content.substring(demoSelection.start, demoSelection.end);
          const post = content.substring(demoSelection.end);
          
          return (
            <>
                {pre}
                <span className="tour-demo-selection-text bg-blue-400/30 rounded-sm border-b-2 border-blue-400/50 inline-block">{mid}</span>
                {post}
                {'\n'}
            </>
          );
      }

      if (!highlights.length) return <span className={isInspectMode ? 'opacity-30 blur-[0.5px] transition-all duration-500' : ''}>{content + '\n'}</span>;

      let lastIndex = 0;
      const fragments = [];
      const sorted = [...highlights].sort((a, b) => a.start - b.start);

      sorted.forEach((h, i) => {
          if (h.start < lastIndex) return; 
          
          const plainText = content.substring(lastIndex, h.start);
          if (plainText) {
              fragments.push(
                  <span key={`plain-${i}`} className={`transition-all duration-500 ${isInspectMode ? 'opacity-30 blur-[0.5px]' : ''}`}>
                      {plainText}
                  </span>
              );
          }
          
          const text = content.substring(h.start, h.end);
          const bgColor = h.type === 'grammar' ? 'rgba(248, 113, 113, 0.25)' : 'rgba(56, 189, 248, 0.25)';
          const borderColor = h.type === 'grammar' ? 'rgba(248, 113, 113, 0.6)' : 'rgba(56, 189, 248, 0.6)';

          fragments.push(
              <span 
                  key={i} 
                  className={`tour-highlight relative rounded-sm mix-blend-multiply dark:mix-blend-screen ${isInspectMode ? 'cursor-help z-20 opacity-100 scale-[1.02] shadow-sm inline-block' : ''} transition-all duration-300`}
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

  const showTextarea = !isInspectMode && (!isIntroAnimating || isFadingOut);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-transparent relative flex flex-col transition-colors duration-700">
        
        <div className="sticky top-0 z-20 bg-paper/90 dark:bg-paper-dark/90 backdrop-blur-md px-4 md:px-8 py-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center transition-colors duration-700">
             
             <div className={`flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 transition-opacity duration-300 ${isInspectMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-sky-400/50 border border-sky-300 dark:border-sky-700"></div>
                    <span>Emotion</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-400/50 border border-red-300 dark:border-red-700"></div>
                    <span>Issue</span>
                </div>
             </div>

             <div className="flex gap-2">
                <button 
                    onClick={onToggleInspectMode}
                    className={`p-2 rounded-lg transition-colors ${isInspectMode ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                >
                    {isInspectMode ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 transition-colors duration-700"></div>
                <button 
                    onClick={onUndo} disabled={!canUndo}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg disabled:opacity-30 transition-colors"
                >
                    <Undo size={18} />
                </button>
                <button 
                    onClick={onRedo} disabled={!canRedo}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg disabled:opacity-30 transition-colors"
                >
                    <Redo size={18} />
                </button>
             </div>
        </div>

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

        <div className="max-w-3xl mx-auto px-4 md:px-8 pb-12 w-full flex-1 relative">
            
            {/* Floating Menu */}
            {(menuPosition && selection && !isInspectMode) && (
                <div 
                    id="floating-menu"
                    className="absolute z-50 bg-white dark:bg-surface-dark shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 flex items-stretch animate-in fade-in zoom-in duration-200 overflow-hidden text-gray-800 dark:text-gray-200 max-w-[92vw] md:max-w-[95vw]"
                    style={{ 
                        top: `${menuPosition.top + menuOffset.y}px`, 
                        left: `${menuPosition.left + menuOffset.x}px` 
                    }}
                >
                    <div 
                        className="w-5 md:w-6 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-move hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors touch-none"
                        onMouseDown={handleDragStart}
                        onTouchStart={handleDragStart}
                    >
                        <GripVertical className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
                    </div>
                    <div className="flex flex-col">
                        {isProcessing ? (
                            <div className="px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 text-xs md:text-sm text-gray-500 dark:text-gray-400 min-w-[120px] md:min-w-[150px] justify-center">
                                <Loader2 className="animate-spin w-3.5 h-3.5 md:w-4 md:h-4" />
                                Refining...
                            </div>
                        ) : (
                            <>
                                {activeSubmenu === 'none' && (
                                    <div className="flex items-center p-1">
                                        <button onClick={() => fetchSuggestion('grammar')} className="px-2 py-1.5 md:px-3 md:py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-xs md:text-sm font-medium transition-colors">
                                            <SpellCheck className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 dark:text-blue-400" /> Fix
                                        </button>
                                        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                        <button onClick={() => setActiveSubmenu('rewrite')} className="px-2 py-1.5 md:px-3 md:py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-xs md:text-sm font-medium transition-colors">
                                            <Wand2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-500 dark:text-purple-400" /> Rewrite <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-gray-400" />
                                        </button>
                                        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                        <button onClick={() => fetchSuggestion('synonyms')} className="px-2 py-1.5 md:px-3 md:py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 text-xs md:text-sm font-medium transition-colors">
                                            <Repeat className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-500 dark:text-green-400" /> Synonyms
                                        </button>
                                    </div>
                                )}
                                {activeSubmenu === 'rewrite' && (
                                    <div className="flex flex-col p-1 w-32 md:w-40">
                                        <button onClick={() => fetchSuggestion('rewrite_short')} className="px-2 py-1.5 md:px-3 md:py-2 text-left text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Shorten</button>
                                        <button onClick={() => fetchSuggestion('rewrite_detailed')} className="px-2 py-1.5 md:px-3 md:py-2 text-left text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Detailed</button>
                                        <button onClick={() => fetchSuggestion('rewrite_formal')} className="px-2 py-1.5 md:px-3 md:py-2 text-left text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Formal</button>
                                        <button onClick={() => fetchSuggestion('rewrite_casual')} className="px-2 py-1.5 md:px-3 md:py-2 text-left text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Casual</button>
                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                        <button onClick={() => setActiveSubmenu('none')} className="px-2 py-1 md:px-3 md:py-1 text-center text-[10px] md:text-xs text-gray-400 hover:text-gray-600">Back</button>
                                    </div>
                                )}
                                {activeSubmenu === 'synonyms' && (
                                    <div className="flex flex-col p-1 w-32 md:w-40">
                                        {synonymList.map((word, i) => (
                                            <button key={i} onClick={() => handleApplyText(word)} className="px-2 py-1.5 md:px-3 md:py-2 text-left text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium">{word}</button>
                                        ))}
                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                        <button onClick={() => setActiveSubmenu('none')} className="px-2 py-1 md:px-3 md:py-1 text-center text-[10px] md:text-xs text-gray-400 hover:text-gray-600">Back</button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Intro Animation (Golden Typewriter) */}
            {isIntroAnimating && (
                <div className={`absolute inset-0 px-4 md:px-8 w-full h-full z-50 flex items-start pointer-events-none transition-opacity duration-1000 ease-in-out ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="font-serif text-lg text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500 font-bold drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] leading-relaxed">
                        {typewriterText}
                        <span className="inline-block w-2 h-5 bg-amber-500 ml-1 animate-pulse align-middle"></span>
                    </div>
                </div>
            )}

            {/* Highlights Overlay / Backdrop */}
            <div 
                ref={backdropRef}
                className={`absolute inset-0 px-4 md:px-8 pb-12 w-full h-full whitespace-pre-wrap font-serif text-lg leading-relaxed overflow-hidden transition-colors duration-700 ${isInspectMode ? 'text-ink dark:text-ink-dark pointer-events-auto z-10' : 'text-transparent pointer-events-none'}`}
                aria-hidden="true"
            >
                {/* Wrapper for Tour Targeting of Inspectors */}
                <span className={isInspectMode ? "tour-inspect-container inline-block w-full" : ""}>
                    {renderContent()}
                </span>
            </div>

            {/* Main Editable Textarea */}
            <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onChange(e.target.value)}
                onSelect={handleSelect}
                onTouchEnd={handleSelect}
                onKeyUp={handleSelect}
                onScroll={handleScroll}
                placeholder="Start forging your story here..."
                className={`absolute inset-0 px-4 md:px-8 pb-12 w-full h-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none font-serif text-lg text-ink dark:text-ink-dark leading-relaxed placeholder:text-gray-300 dark:placeholder:text-gray-700 selection:bg-amber-200 dark:selection:bg-amber-900 selection:text-amber-900 dark:selection:text-amber-100 transition-opacity duration-1000 ${showTextarea ? 'opacity-100' : 'opacity-0'}`}
                spellCheck={false}
                disabled={isInspectMode}
            />
        </div>
    </div>
  );
};

export default Editor;
