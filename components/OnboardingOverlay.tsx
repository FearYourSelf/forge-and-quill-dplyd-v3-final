import React, { useState } from 'react';
import { X, ArrowRight, Bot, Mic, Feather, Sliders, Flame, PenTool } from 'lucide-react';

interface OnboardingOverlayProps {
  onClose: () => void;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Forge & Quill",
      description: "Your AI-powered companion for creating deep, consistent characters for Talkie.",
      icon: <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20 relative overflow-hidden animate-float">
                <Flame size={40} className="absolute text-yellow-200/40 top-[-5px] right-[-5px] animate-flicker" />
                <PenTool size={32} className="relative z-10" />
            </div>
    },
    {
      title: "Meet Geny",
      description: "Your proactive writing assistant. Ask Geny to write intros, refine backstories, or brainstorm ideas. It can directly update your draft and settings!",
      icon: <Bot size={48} className="text-accent" />
    },
    {
      title: "Draft & Talkie Settings",
      description: "Switch between 'Draft' to write your story and 'Talkie Settings' to define the character core. Geny works across both tabs.",
      icon: <div className="flex gap-4"><Feather size={32} className="text-gray-400" /><Sliders size={32} className="text-accent" /></div>
    },
    {
      title: "Live Voice Brainstorming",
      description: "Tap the microphone to talk to Geny in real-time. Perfect for bouncing ideas around when you're stuck.",
      icon: <Mic size={48} className="text-green-500" />
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
      <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8 relative animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
        
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mt-4">
           <div className="mb-6 p-6 bg-gray-50 dark:bg-gray-800 rounded-full ring-1 ring-gray-100 dark:ring-gray-700 animate-pulse-glow">
              {steps[step].icon}
           </div>
           
           <h2 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-3 animate-in slide-in-from-bottom-2">
              {steps[step].title}
           </h2>
           
           <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-8 max-w-sm mx-auto animate-in slide-in-from-bottom-3 delay-75">
              {steps[step].description}
           </p>

           <div className="flex items-center gap-2 mb-8">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-accent' : 'w-2 bg-gray-200 dark:bg-gray-700'}`} 
                />
              ))}
           </div>

           <button 
             onClick={handleNext}
             className="w-full py-3 bg-accent text-white rounded-xl font-medium shadow-lg shadow-accent/20 hover:bg-amber-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
           >
             {step === steps.length - 1 ? "Get Started" : "Next"}
             {step < steps.length - 1 && <ArrowRight size={18} />}
           </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingOverlay;