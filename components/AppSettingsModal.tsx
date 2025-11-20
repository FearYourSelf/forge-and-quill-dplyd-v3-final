
import React from 'react';
import { Bug, Save, Mic, Volume2, Play, Square, X, HelpCircle, RefreshCw } from 'lucide-react';

interface AppSettings {
  debugMode: boolean;
  autoSave: boolean;
  voiceLive: string;
  voiceTTS: string;
}

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  onVoicePreview: (voiceName: string) => void;
  onShowTutorial: () => void;
  isPreviewPlaying: boolean;
}

const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSettingsChange, 
  onVoicePreview, 
  onShowTutorial,
  isPreviewPlaying 
}) => {
  
  const handleToggle = (key: keyof AppSettings) => {
      onSettingsChange({ ...settings, [key]: !settings[key] });
  };

  const handleChange = (key: keyof AppSettings, value: string) => {
      onSettingsChange({ ...settings, [key]: value });
  };

  // We render always to allow CSS exit animations, using opacity/pointer-events to toggle visibility.
  return (
    <div 
        className={`fixed inset-0 z-[150] flex items-center justify-center p-4 transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!isOpen}
    >
        {/* Backdrop with smooth fade */}
        <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" 
            onClick={onClose}
        />

        {/* Modal Box with smooth zoom/fade/slide */}
        <div className={`
            relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden 
            transition-all duration-300 ease-out transform
            ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}
        `}>
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                <h2 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">Application Settings</h2>
                <button 
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="p-2 overflow-y-auto max-h-[60vh]">
                {/* Debug Mode */}
                <div className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                            <Bug size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Debug Mode</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Show detailed error messages in Geny chat.</p>
                        </div>
                    </div>
                    <button 
                    onClick={() => handleToggle('debugMode')}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.debugMode ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.debugMode ? 'translate-x-6' : ''}`} />
                    </button>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800 mx-5"></div>

                {/* Auto-Save */}
                <div className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                            <Save size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Auto-Save</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Automatically save changes every few seconds.</p>
                        </div>
                    </div>
                    <button 
                    onClick={() => handleToggle('autoSave')}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoSave ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.autoSave ? 'translate-x-6' : ''}`} />
                    </button>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800 mx-5"></div>

                {/* Voice - Live */}
                <div className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                            <Mic size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Geny Voice (Live)</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Select the voice for real-time brainstorming.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pl-16 sm:pl-0">
                        <button 
                        onClick={() => onVoicePreview(settings.voiceLive)}
                        className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300"
                        title="Preview Voice"
                        >
                            {isPreviewPlaying ? <Square size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" />}
                        </button>
                        <select 
                        value={settings.voiceLive}
                        onChange={(e) => handleChange('voiceLive', e.target.value)}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-accent text-sm w-full sm:w-auto cursor-pointer"
                        >
                            <option value="Aoede">Geny (Official)</option>
                            <option value="Puck">Puck (Playful)</option>
                            <option value="Charon">Charon (Deep)</option>
                            <option value="Kore">Kore (Soft)</option>
                            <option value="Fenrir">Fenrir (Intense)</option>
                        </select>
                    </div>
                </div>
                
                <div className="h-px bg-gray-100 dark:bg-gray-800 mx-5"></div>

                {/* Voice - TTS */}
                <div className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            <Volume2 size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Reading Voice</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Select the voice for reading your draft aloud.</p>
                        </div>
                    </div>
                    <div className="pl-16 sm:pl-0">
                        <select 
                            value={settings.voiceTTS}
                            onChange={(e) => handleChange('voiceTTS', e.target.value)}
                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-accent text-sm w-full sm:w-auto cursor-pointer"
                        >
                            <option value="Aoede">Geny (Official)</option>
                            <option value="Puck">Puck</option>
                            <option value="Charon">Charon</option>
                            <option value="Kore">Kore</option>
                            <option value="Fenrir">Fenrir</option>
                        </select>
                    </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800 mx-5"></div>

                {/* Help Section */}
                <div className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                            <HelpCircle size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Tutorial</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">View the welcome guide again.</p>
                        </div>
                    </div>
                    <button 
                        onClick={onShowTutorial}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Replay
                    </button>
                </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 text-right border-t border-gray-100 dark:border-gray-800">
                 <button onClick={onClose} className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90 transition-opacity">
                     Close
                 </button>
            </div>

        </div>
    </div>
  );
};

export default AppSettingsModal;
