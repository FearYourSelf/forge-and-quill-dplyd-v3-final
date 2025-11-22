import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI as Engine, Modality as M, LiveServerMessage as LSM, FunctionDeclaration as FD, Type as T } from '@google/genai';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import { createPcmBlob, decode, pcmToAudioBuffer } from '../services/audioUtils';
import { ToolCallHandler, AppState } from '../types';

const M_LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025';

interface LiveSessionProps {
  onClose: () => void;
  onToolCall: ToolCallHandler;
  currentContext: AppState;
  voiceName: string;
}

const D_1: FD = {
  name: 'createFullCharacter',
  description: 'Generates profile.',
  parameters: {
    type: T.OBJECT,
    properties: {
      name: { type: T.STRING },
      role: { type: T.STRING },
      age: { type: T.STRING },
      personality: { type: T.STRING },
      backstory: { type: T.STRING },
      biography: { type: T.STRING },
      draft_intro: { type: T.STRING },
      world_lore: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: {
            category: { type: T.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
            title: { type: T.STRING },
            description: { type: T.STRING }
          }
        }
      }
    },
    required: ['name', 'role', 'personality', 'draft_intro', 'world_lore']
  }
};

const D_2: FD = {
    name: 'updateDraft',
    description: 'Updates text.',
    parameters: { 
        type: T.OBJECT, 
        properties: { 
            text: { type: T.STRING },
            action: { type: T.STRING, enum: ['append', 'replace'] }
        },
        required: ['text']
    }
};

const D_3: FD = {
    name: 'updateCharacterProfile',
    description: 'Updates fields.',
    parameters: {
        type: T.OBJECT,
        properties: {
        field: { type: T.STRING, enum: ['name', 'role', 'age', 'personality', 'backstory', 'biography'] },
        value: { type: T.STRING }
        },
        required: ['field', 'value']
    }
};

const D_4: FD = {
  name: 'addWorldEntry',
  description: 'Adds entry.',
  parameters: {
    type: T.OBJECT,
    properties: {
      category: { type: T.STRING, enum: ['Lore', 'Location', 'Relationship', 'Magic'] },
      title: { type: T.STRING },
      description: { type: T.STRING }
    },
    required: ['category', 'title', 'description']
  }
};

const Visualizer: React.FC<{ audioCtx: AudioContext | null, sourceNode: AudioNode | null, isActive: boolean, color: string }> = ({ audioCtx, sourceNode, isActive, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const raf = useRef<number>(0);

    useEffect(() => {
        if (!isActive || !audioCtx || !sourceNode || !canvasRef.current) return;

        const an = audioCtx.createAnalyser();
        an.fftSize = 64; 
        an.smoothingTimeConstant = 0.6;
        sourceNode.connect(an);

        const data = new Uint8Array(an.frequencyBinCount);
        const cvs = canvasRef.current;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            raf.current = requestAnimationFrame(draw);
            an.getByteFrequencyData(data);
            ctx.clearRect(0, 0, cvs.width, cvs.height);
            const w = (cvs.width / data.length) * 2.5;
            let x = 0;
            const cy = cvs.height / 2;
            ctx.beginPath();
            for (let i = 0; i < data.length; i++) {
                const v = data[i] / 128.0; 
                const y = v * (cvs.height / 3);
                ctx.fillStyle = color;
                if (data[i] > 5) ctx.fillRect(x, cy - (y/2), w - 2, y);
                else ctx.fillRect(x, cy - 1, w - 2, 2);
                x += w + 1;
            }
        };
        draw();
        return () => {
            cancelAnimationFrame(raf.current);
            try { sourceNode.disconnect(an); } catch{}
        };
    }, [audioCtx, sourceNode, isActive, color]);

    return <canvas ref={canvasRef} width={160} height={40} className="w-full h-full opacity-80" />;
};

const LiveSession: React.FC<LiveSessionProps> = ({ onClose, onToolCall, currentContext, voiceName }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  const ctxOut = useRef<AudioContext | null>(null);
  const ctxIn = useRef<AudioContext | null>(null);
  const [srcIn, setSrcIn] = useState<AudioNode | null>(null);
  const [srcOut, setSrcOut] = useState<AudioNode | null>(null);

  const nextT = useRef<number>(0);
  const srcs = useRef<Set<AudioBufferSourceNode>>(new Set());
  const gain = useRef<GainNode | null>(null);
  
  const active = useRef(false);

  useEffect(() => {
      const init = async () => {
        setStatus('connecting');
        try {
          const eng = new Engine({ apiKey: process.env.API_KEY });
          
          const out = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          ctxOut.current = out;
          const gn = out.createGain();
          gn.connect(out.destination);
          gain.current = gn;
          setSrcOut(gn); 

          const inp = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          ctxIn.current = inp;

          if (inp.state === 'suspended') await inp.resume();

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ms = inp.createMediaStreamSource(stream);
          setSrcIn(ms); 

          const ctxStr = `Draft: ${currentContext.draft.substring(0, 2000)}...\nSettings: ${JSON.stringify(currentContext.settings)}`;

          const p = eng.live.connect({
            model: M_LIVE,
            callbacks: {
                onopen: () => {
                    setStatus('connected');
                    active.current = true;

                    const sp = inp.createScriptProcessor(4096, 1, 1);
                    sp.onaudioprocess = (e) => {
                        if (!active.current) return;
                        const d = e.inputBuffer.getChannelData(0);
                        const b = createPcmBlob(d);
                        p.then(s => s.sendRealtimeInput({ media: b }));
                    };
                    ms.connect(sp);
                    sp.connect(inp.destination);
                },
                onmessage: async (m: LSM) => {
                    if (m.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
                        const d = m.serverContent.modelTurn.parts[0].inlineData.data;
                        if (ctxOut.current && gain.current) {
                            const buf = await pcmToAudioBuffer(decode(d), ctxOut.current, 24000, 1);
                            const s = ctxOut.current.createBufferSource();
                            s.buffer = buf;
                            s.connect(gain.current);
                            const n = ctxOut.current.currentTime;
                            const t = Math.max(n, nextT.current);
                            s.start(t);
                            nextT.current = t + buf.duration;
                            s.onended = () => srcs.current.delete(s);
                            srcs.current.add(s);
                        }
                    }
                    
                    if (m.toolCall) {
                        for (const fc of m.toolCall.functionCalls) {
                            onToolCall(fc.name, fc.args);
                            p.then(s => s.sendToolResponse({
                                functionResponses: [{
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: "OK" }
                                }]
                            }));
                        }
                    }

                    if (m.serverContent?.interrupted) {
                        srcs.current.forEach(s => { try { s.stop(); } catch{} });
                        srcs.current.clear();
                        nextT.current = 0;
                    }
                },
                onclose: () => {
                    setStatus('idle');
                    active.current = false;
                },
                onerror: (err) => {
                    console.error(err);
                    setStatus('error');
                    active.current = false;
                }
            },
            config: {
                systemInstruction: `Act as 'Geny' or defined character.\nCONTEXT:\n${ctxStr}`,
                tools: [{ functionDeclarations: [D_1, D_2, D_3, D_4] }],
                responseModalities: [M.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Aoede' } }
                }
            }
          });
        } catch (error) {
          console.error(error);
          setStatus('error');
        }
      };

      init();

      return () => {
        active.current = false;
        srcs.current.forEach(s => { try { s.stop(); } catch{} });
        srcs.current.clear();
        if (ctxIn.current) { ctxIn.current.close(); ctxIn.current = null; }
        if (ctxOut.current) { ctxOut.current.close(); ctxOut.current = null; }
      };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 flex flex-col">
        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 flex justify-between items-center border-b border-gray-800">
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                <span className="font-bold font-serif text-sm">Live Uplink</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <X size={18} />
            </button>
        </div>
        
        <div className="h-24 bg-black/50 relative flex items-center justify-center">
             {status === 'connecting' && (
                 <div className="flex items-center gap-2 text-xs text-gray-400">
                     <RefreshCw className="animate-spin" size={14} /> Init...
                 </div>
             )}
             
             {status === 'error' && (
                 <div className="flex items-center gap-2 text-xs text-red-400">
                     <AlertCircle size={14} /> Failed
                 </div>
             )}

             {status === 'connected' && (
                <div className="w-full h-full flex flex-col">
                    <div className="flex-1 relative">
                         <Visualizer audioCtx={ctxOut.current} sourceNode={srcOut} isActive={true} color="#fbbf24" />
                    </div>
                    <div className="h-px bg-gray-800 w-full"></div>
                     <div className="flex-1 relative">
                         <Visualizer audioCtx={ctxIn.current} sourceNode={srcIn} isActive={true} color="#4ade80" />
                    </div>
                </div>
             )}
        </div>

        <div className="p-3 text-xs text-center text-gray-500 bg-gray-900">
             Voice active.
        </div>
    </div>
  );
};

export default LiveSession;