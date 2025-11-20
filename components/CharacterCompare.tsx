import React, { useState } from 'react';
import { X, CheckCircle2, ArrowLeftRight, Globe } from 'lucide-react';
import { AppState } from '../types';

interface CharacterCompareProps {
  savedCharacters: AppState[];
  onClose: () => void;
}

const CharacterCompare: React.FC<CharacterCompareProps> = ({ savedCharacters, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(pid => pid !== id));
    } else {
      if (selectedIds.length < 2) {
        setSelectedIds(prev => [...prev, id]);
      }
    }
  };

  const char1 = savedCharacters.find(c => c.id === selectedIds[0]);
  const char2 = savedCharacters.find(c => c.id === selectedIds[1]);

  const isSelectionMode = selectedIds.length < 2;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl h-[85vh] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ArrowLeftRight className="text-accent" size={24} />
              Character Comparison
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSelectionMode ? "Select 2 characters to compare" : "Viewing comparison"}
            </p>
          </div>
          <div className="flex gap-3">
            {!isSelectionMode && (
               <button 
                  onClick={() => setSelectedIds([])} 
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
               >
                 Reset Selection
               </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          
          {/* SELECTION MODE */}
          {isSelectionMode && (
            <div className="h-full overflow-y-auto p-6">
               {savedCharacters.length < 2 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                     <p className="text-lg font-medium mb-2">Not enough characters</p>
                     <p className="text-sm">You need at least 2 saved characters to use this feature.</p>
                  </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {savedCharacters.map(char => {
                      const isSelected = selectedIds.includes(char.id);
                      return (
                        <div 
                          key={char.id}
                          onClick={() => toggleSelection(char.id)}
                          className={`
                             cursor-pointer relative p-5 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02]
                             ${isSelected 
                                ? 'border-accent bg-accent/5 dark:bg-accent/10 shadow-lg shadow-accent/20' 
                                : 'border-transparent bg-gray-50 dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600'}
                          `}
                        >
                          <div className="flex justify-between items-start mb-2">
                             <h3 className="font-bold text-gray-900 dark:text-white truncate pr-2">{char.settings.name || 'Untitled'}</h3>
                             {isSelected && <CheckCircle2 size={20} className="text-accent shrink-0" />}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{char.settings.role || 'Unknown Role'}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Last edited: {new Date(char.lastSaved || '').toLocaleDateString()}</div>
                        </div>
                      );
                    })}
                 </div>
               )}
            </div>
          )}

          {/* COMPARISON MODE */}
          {!isSelectionMode && char1 && char2 && (
             <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800">
                
                {/* Character 1 */}
                <div className="flex-1 flex flex-col h-1/2 md:h-full overflow-hidden bg-white dark:bg-gray-900/50">
                   <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
                      <h3 className="text-2xl font-serif font-bold text-gray-900 dark:text-white text-center">{char1.settings.name}</h3>
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400">{char1.settings.role}</p>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      <Section title="Age" content={char1.settings.age} />
                      <Section title="Personality" content={char1.settings.personality} />
                      <Section title="Backstory" content={char1.settings.backstory} />
                      <Section title="Biography" content={char1.settings.biography} />
                      
                      {/* World Items */}
                      <div>
                         <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Globe size={14}/> World Codex</h4>
                         <div className="space-y-3">
                            {char1.worldItems.map(item => (
                               <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm border border-gray-100 dark:border-gray-700">
                                  <span className="text-[10px] font-bold text-accent uppercase block mb-1">{item.category}</span>
                                  <strong className="block text-gray-900 dark:text-gray-100">{item.title}</strong>
                                  <p className="text-gray-600 dark:text-gray-400 mt-1">{item.description}</p>
                               </div>
                            ))}
                            {char1.worldItems.length === 0 && <p className="text-sm text-gray-400 italic">No world entries.</p>}
                         </div>
                      </div>
                   </div>
                </div>

                {/* VS Badge (Desktop) */}
                <div className="hidden md:flex items-center justify-center w-0 relative z-20">
                    <div className="absolute w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-400 shadow-lg">VS</div>
                </div>

                {/* Character 2 */}
                <div className="flex-1 flex flex-col h-1/2 md:h-full overflow-hidden bg-gray-50/30 dark:bg-black/20">
                   <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
                      <h3 className="text-2xl font-serif font-bold text-gray-900 dark:text-white text-center">{char2.settings.name}</h3>
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400">{char2.settings.role}</p>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      <Section title="Age" content={char2.settings.age} />
                      <Section title="Personality" content={char2.settings.personality} />
                      <Section title="Backstory" content={char2.settings.backstory} />
                      <Section title="Biography" content={char2.settings.biography} />

                       {/* World Items */}
                       <div>
                         <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Globe size={14}/> World Codex</h4>
                         <div className="space-y-3">
                            {char2.worldItems.map(item => (
                               <div key={item.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm border border-gray-100 dark:border-gray-700 shadow-sm">
                                  <span className="text-[10px] font-bold text-accent uppercase block mb-1">{item.category}</span>
                                  <strong className="block text-gray-900 dark:text-gray-100">{item.title}</strong>
                                  <p className="text-gray-600 dark:text-gray-400 mt-1">{item.description}</p>
                               </div>
                            ))}
                             {char2.worldItems.length === 0 && <p className="text-sm text-gray-400 italic">No world entries.</p>}
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, content }: { title: string, content: string }) => (
   <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{title}</h4>
      <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
         {content || <span className="text-gray-400 italic">Not defined</span>}
      </div>
   </div>
);

export default CharacterCompare;