
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, FunctionDeclaration, Type } from '@google/genai';
import { Mic, X, AlertCircle, RefreshCw } from 'lucide-react';
import { createPcmBlob, decode, pcmToAudioBuffer } from '../services/audioUtils';
import { ToolCallHandler, AppState } from '../types';

const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025';

interface LiveSessionProps {
  onClose: () => void;
  onToolCall: ToolCallHandler;
  currentContext: AppState;
  voiceName: string;
}

const createFullCharacterTool: FunctionDeclaration = {
  name: 'createFullCharacter',
  description: 'Creates or Overhauls a complete character profile, including settings, story draft intro, and world lore in one go.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      role: { type: Type.STRING },
      age: { type: Type.STRING },
      personality: { type: Type.STRING },
      backstory: { type: Type.STRING },
      biography: { type: Type.STRING },
      draft_intro: { type: Type.STRING, description: 'A compelling 300+ word introductory scene/story starter for the Draft tab.' },
      world_lore: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          }
        },
        description: 'Array of 3-5 world building items related to the character.'
      }
    },
    required: ['name', 'role', 'personality', 'draft_intro', 'world_lore']
  }
};

const updateDraftTool: FunctionDeclaration = {
    name: 'updateDraft',
    description: 'Updates the user\'s story draft with new text.',
    parameters: { 
        type: Type.OBJECT, 
        properties: { 
            text: { type: Type.STRING, description: "The text to add to the story." },
            action: { type: Type.STRING, enum: ['append', 'replace'], description: "How to update." }
        },
        required: ['text']
    }
};

const updateCharacterProfileTool: FunctionDeclaration = {
    name: 'updateCharacterProfile',
    description: 'Updates the character settings fields (name, age, role, etc).',
    parameters: {
        type: Type.OBJECT,
        properties: {
        field: { type: Type.STRING, enum: ['name', 'role', 'age', 'personality', 'backstory', 'biography'] },
        value: { type: Type.STRING }
        },
        required: ['field', 'value']
    }
};

const addWorldEntryTool: FunctionDeclaration = {
  name: 'addWorldEntry',
  description: 'Adds a lore entry, location, relationship, or magic rule to the World Codex.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'], description: 'The category of the entry.' },
      title: { type: Type.STRING, description: 'The title of the entry (e.g. "The Crystal Spire").' },
      description: { type: Type.STRING, description: 'The description/details of the entry.' }
    },
    required: ['category', 'title', 'description']
  }
};

// Dynamic Capsule Waveform Visualizer
const CapsuleVisualizer: React.FC<{ audioCtx: AudioContext | null, sourceNode: AudioNode | null, isActive: boolean, color: string }> = ({ audioCtx, sourceNode, isActive, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const reqRef = useRef<number>(0);

    useEffect(() => {
        if (!isActive || !audioCtx || !sourceNode || !canvasRef.current) return;

        // Setup Analyser
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64; 
        analyser.smoothingTimeConstant = 0.6;
        sourceNode.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            reqRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw Waveform
            const barWidth = (canvas.width / dataArray.length) * 2.5;
            let x = 0;
            const centerY = canvas.height / 2;

            ctx.beginPath();
            ctx.moveTo(0, centerY);

            // Smooth curve through points
            for (let i = 0; i < dataArray.length; i++) {
                const v = dataArray[i] / 128.0; 
                const y = v * (canvas.height / 3); // Amplitude scaling

                // Reflection for symmetry
                const yTop = centerY - y/2;
                const yBottom = centerY + y/2;
                
                ctx.fillStyle = color;
                // Draw rounded bars instead of a line for the "capsule" look
                if (dataArray[i] > 5) {
                     ctx.fillRect(x, centerY - (y/2), barWidth - 2, y);
                } else {
                     // Idle dot
                     ctx.fillRect(x, centerY - 1, barWidth - 2, 2);
                }
                
                x += barWidth + 1;
            }
        };
        draw();

        return () => {
            cancelAnimationFrame(reqRef.current);
            try { sourceNode.disconnect(analyser); } catch(e){}
        };
    }, [audioCtx, sourceNode, isActive, color]);

    return <canvas ref={canvasRef} width={160} height={40} className="w-full h-full opacity-80" />;
};


const LiveSession: React.FC<LiveSessionProps> = ({ onClose, onToolCall, currentContext, voiceName }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const [inputSource, setInputSource] = useState<AudioNode | null>(null);
  const [outputSource, setOutputSource] = useState<AudioNode | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outputGainRef = useRef<GainNode | null>(null);
  
  // Guard to prevent sending data when not connected
  const isConnectedRef = useRef(false);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    isConnectedRef.current = false;
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus('idle');
  };

  const startSession = async () => {
    // Reset state if retrying
    if (status === 'error') {
        cleanup();
    }

    setStatus('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputAudioContext;
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      outputGainRef.current = outputNode;
      setOutputSource(outputNode); 

      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputAudioContext;

      // Ensure context is running (handling user gesture requirement)
      if (inputAudioContext.state === 'suspended') {
        await inputAudioContext.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micSource = inputAudioContext.createMediaStreamSource(stream);
      setInputSource(micSource); 

      const contextStr = `
      CURRENT DRAFT:
      ${currentContext.draft.substring(0, 2000)}...
      
      TALKIE SETTINGS:
      Name: ${currentContext.settings.name}
      Role: ${currentContext.settings.role}
      Personality: ${currentContext.settings.personality}
      Biography: ${currentContext.settings.biography}
      `;

      const sessionPromise = ai.live.connect({
        model: MODEL_LIVE,
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [createFullCharacterTool, updateDraftTool, updateCharacterProfileTool, addWorldEntryTool] }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
          systemInstruction: `You are Geny, a creative writing coach and dynamic brainstorming partner for Talkie creators.
          CONTEXT: ${contextStr}
          
          RULES:
          1. BE PROACTIVE & IMMEDIATELY GREET THE USER: As soon as the session starts, you MUST introduce yourself as Geny and warmly welcome the user using the voice provided.
             Example Greeting: "Hello! I'm Geny, ready to help you build your next amazing Talkie character. What ideas are we playing with today?"
          2. Do not wait for the user to speak first. Speak immediately upon connection.
          3. BE DYNAMIC: Suggest ideas, ask follow-up questions, and be enthusiastic.
          4. If the user asks to create a NEW character or do a full overhaul, you MUST use the 'createFullCharacter' tool. Do NOT update fields one by one.
          5. If the user asks to update just the draft, use updateDraft.
          6. If the user asks to update character details, use updateCharacterProfile.
          `,
        },
        callbacks: {
          onopen: async () => {
            isConnectedRef.current = true;
            setStatus('connected');
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (!isConnectedRef.current) return; // Guard
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => {
                  console.error("Send input error:", err);
              });
            };
            
            micSource.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall?.functionCalls) {
                for (const fc of message.toolCall.functionCalls) {
                    const name = fc.name || 'unknown_tool';
                    onToolCall(name === 'updateDraft' ? 'updateStory' : name, fc.args);
                    sessionPromise.then(session => {
                        session.sendToolResponse({
                            functionResponses: { id: fc.id, name: name, response: { result: 'ok' } }
                        });
                    });
                }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const ctx = audioContextRef.current;
                const outNode = outputGainRef.current;
                if(!ctx || !outNode) return;

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await pcmToAudioBuffer(
                    decode(base64Audio),
                    ctx,
                    24000,
                    1
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outNode);
                source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
            }
            
            if (message.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => {
                     try { s.stop(); } catch(e){}
                 });
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            isConnectedRef.current = false;
            setStatus('idle');
          },
          onerror: (err) => {
            console.error('Session Error', err);
            isConnectedRef.current = false;
            setStatus('error');
          }
        }
      });

    } catch (e) {
      console.error("Failed to start live session", e);
      setStatus('error');
    }
  };

  // Start Button (Idle)
  if (status === 'idle') {
      return (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in zoom-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                onClick={startSession}
                className="flex items-center gap-3 px-6 py-3 bg-accent hover:bg-amber-700 text-white rounded-full shadow-lg transition-all hover:scale-105 font-medium animate-pulse-glow"
            >
                <Mic size={20} />
                <span>Start Brainstorm</span>
            </button>
        </div>
      );
  }

  // Loading State
  if (status === 'connecting') {
      return (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in zoom-in fade-in duration-300">
             <div className="bg-white dark:bg-surface-dark px-6 py-3 rounded-full shadow-xl border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Connecting to Geny...</span>
             </div>
        </div>
      );
  }

  // Active Capsule Interface
  return (
    <div className="fixed bottom-24 md:bottom-8 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-full max-w-md px-4 animate-in zoom-in fade-in slide-in-from-bottom-8 duration-500 ease-out">
        
        {/* The Dynamic Capsule */}
        <div className="w-full bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 flex items-center p-2 gap-4 h-20 relative overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
            
            {/* Close Button */}
            <button 
                onClick={cleanup}
                className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors shrink-0 z-10"
            >
                <X size={20} />
            </button>

            {/* Status Indicator & Visualizer */}
            <div className="flex-1 flex flex-col justify-center h-full relative">
                 {/* Labels */}
                 <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1 px-1">
                    <span>{voiceName === 'Aoede' ? 'Geny (Official)' : voiceName}</span>
                    <span>You</span>
                 </div>

                 {/* Waveforms Container */}
                 <div className="flex-1 flex items-center gap-2 relative">
                      <div className="flex-1 h-8 rounded bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden border border-gray-100 dark:border-gray-800 relative">
                         <CapsuleVisualizer audioCtx={audioContextRef.current} sourceNode={outputSource} isActive={true} color="#d97706" />
                      </div>
                      <div className="flex-1 h-8 rounded bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden border border-gray-100 dark:border-gray-800 relative">
                         <CapsuleVisualizer audioCtx={inputContextRef.current} sourceNode={inputSource} isActive={true} color="#10b981" />
                      </div>
                 </div>
            </div>
        </div>
        
        {status === 'error' && (
            <button 
                onClick={startSession}
                className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-in fade-in shadow-sm hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
            >
                <AlertCircle size={12} />
                Service Unavailable. Tap to Retry.
                <RefreshCw size={10} className="ml-1" />
            </button>
        )}
    </div>
  );
};

export default LiveSession;
