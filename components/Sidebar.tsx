
import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, Bot, AlertCircle, Mic } from 'lucide-react';
import { chatWithGeminiStream } from '../services/geminiService';
import { ChatMessage, ToolCallHandler } from '../types';

interface SidebarProps {
  isOpen: boolean;
  draftContext: string;
  onToolCall: ToolCallHandler;
  debugMode?: boolean;
  onStartLive: () => void;
}

const FALLBACK_MESSAGES = [
    "I've applied those changes for you! How does it look?",
    "Done! I've updated the Talkie details. What's next?",
    "Changes applied! Do you want to refine the backstory further?",
    "Got it. I've updated the draft. Does that capture the vibe you wanted?",
    "All set! I've tweaked the settings. Should we work on the intro scene now?"
];

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const renderInline = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      return part.split(/(\*.*?\*)/g).map((subPart, j) => {
        if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
           return <em key={`${i}-${j}`} className="italic">{subPart.slice(1, -1)}</em>;
        }
        return subPart;
      });
    });
  };

  return (
    <div className="space-y-1 text-sm">
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2"></div>;
        
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            return (
                <div key={i} className="flex items-start gap-2 ml-1">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0"></span>
                    <div className="flex-1 leading-relaxed">{renderInline(trimmed.substring(2))}</div>
                </div>
            )
        }
        
        if (/^\d+\.\s/.test(trimmed)) {
           const dotIndex = trimmed.indexOf('.');
           const number = trimmed.substring(0, dotIndex + 1);
           const content = trimmed.substring(dotIndex + 1);
           return (
              <div key={i} className="flex items-start gap-2 ml-1">
                  <span className="font-bold opacity-80 min-w-[1.5em]">{number}</span>
                  <div className="flex-1 leading-relaxed">{renderInline(content)}</div>
              </div>
           )
        }
        
        return <div key={i} className="leading-relaxed">{renderInline(line)}</div>;
      })}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, draftContext, onToolCall, debugMode = false, onStartLive }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'model',
      text: "Hi! I'm Geny. I can write parts of the story or update your settings. Just ask!"
    }
  ]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    // Placeholder for AI message
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: '', isThinking: true }]);

    try {
      const history = messages.filter(m => m.text.trim() !== '').map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const stream = chatWithGeminiStream(history, userMsg.text, userMsg.image?.split(',')[1], draftContext);

      let accumulatedText = "";
      let toolExecuted = false;

      for await (const chunk of stream) {
          // Handle text streaming
          if (chunk.text) {
            accumulatedText += chunk.text;
            setMessages(prev => prev.map(m => 
                m.id === aiMsgId ? { ...m, text: accumulatedText, isThinking: false } : m
            ));
          }

          // Handle Tool Calls
          if (chunk.functionCalls) {
              toolExecuted = true;
              for (const call of chunk.functionCalls) {
                  if (call.name) {
                    onToolCall(call.name, call.args);
                  }
              }
          }
      }
      
      // Fallback if tool executed but no text
      if (toolExecuted && !accumulatedText.trim()) {
          const randomMsg = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
          setMessages(prev => prev.map(m => 
            m.id === aiMsgId ? { ...m, text: randomMsg, isThinking: false } : m
          ));
      }

    } catch (error: any) {
      console.error("Gemini Error:", error);
      // Use the friendly message from our service, or fallback
      const msg = error?.message || "Unknown error";
      
      const errorText = debugMode 
          ? `Error: ${msg}` 
          : "Sorry, I ran into a creative block. Please try again.";
          
      setMessages(prev => prev.map(m => 
        m.id === aiMsgId ? { ...m, text: errorText, isThinking: false } : m
      ));
    } finally {
        setIsLoading(false);
        // Clean up any dangling empty messages that weren't caught by fallback
        setMessages(prev => prev.filter(m => m.isThinking || m.text.trim() !== ''));
    }
  };

  // We no longer return null if !isOpen, so parent can animate width/transform.
  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-dark shadow-none z-40 transition-colors duration-700 relative w-full">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-paper dark:bg-surface-dark flex items-center justify-between transition-colors duration-700">
        <div className="flex items-center gap-2">
            <Bot className="text-accent" size={20} />
            <h2 className="font-serif font-bold text-gray-800 dark:text-gray-100">Geny</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-surface-dark transition-colors duration-700">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm transition-all duration-300 ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-none hover:shadow-md'
                  : 'bg-gray-100 dark:bg-gray-750 text-gray-800 dark:text-gray-200 rounded-bl-none hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="mb-2 rounded-lg max-h-32 object-cover" />
              )}
              {msg.isThinking && !msg.text ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={14} />
                    <span className="text-xs opacity-70">Geny is thinking...</span>
                  </div>
              ) : (
                 <>
                   {msg.text.startsWith('Error:') ? (
                       <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
                           <AlertCircle size={16} className="mt-0.5 shrink-0" />
                           <span className="text-sm font-medium">{msg.text}</span>
                       </div>
                   ) : (
                       <FormattedText text={msg.text} />
                   )}
                 </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 pb-8 md:pb-4 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 transition-colors duration-700">
        {selectedImage && (
          <div className="mb-2 relative inline-block animate-in zoom-in duration-200">
            <img src={selectedImage} alt="Preview" className="h-16 rounded border border-gray-200 dark:border-gray-700" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:scale-110 transition-transform"
            >
              <span className="sr-only">Remove</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <ImageIcon size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageSelect}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask Geny..."
            className="flex-1 resize-none border-0 bg-gray-50 dark:bg-gray-800 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-accent/20 focus:outline-none max-h-32 transition-shadow transition-colors duration-300"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && !selectedImage)}
            className="p-2 bg-accent text-white rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:scale-105 active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="text-[10px] text-gray-300 dark:text-gray-600 text-center mt-2 pb-1 select-none">
             For the Talkie community with love by <a href="https://www.talkie-ai.com/profile/notsodangerous-327065556930864" target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors whitespace-nowrap font-medium text-yellow-500 dark:text-yellow-400">NotSoDangerous<span className="text-red-500 ml-0.5">❤️</span></a>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
