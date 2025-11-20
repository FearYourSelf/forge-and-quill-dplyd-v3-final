
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RefreshCw, Sparkles } from 'lucide-react';
import { AnalysisResult } from '../types';

interface ToneAnalyzerProps {
  draft: string;
  result: AnalysisResult | null;
  onAnalyze: () => void;
  loading: boolean;
}

const ToneAnalyzer: React.FC<ToneAnalyzerProps> = ({ draft, result, onAnalyze, loading }) => {

  const getEmotionColor = (score: number) => {
      if (score > 0.75) return '#16a34a'; // green
      if (score > 0.50) return '#d97706'; // amber
      return '#9ca3af'; // gray
  };

  const getDominantEmotion = () => {
      if (!result || !result.emotion || result.emotion.length === 0) return 'Neutral';
      return [...result.emotion].sort((a, b) => b.score - a.score)[0].name;
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 h-full max-h-full overflow-y-auto transition-colors duration-300 flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h3 className="font-serif font-bold text-xl text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Sparkles size={20} className="text-accent" />
          Tone & Emotion
        </h3>
        <button
          onClick={onAnalyze}
          disabled={loading || !draft}
          className="p-2 text-gray-500 hover:text-accent hover:bg-amber-50 dark:hover:bg-gray-800 rounded-lg transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!result ? (
        <div className="text-center text-gray-400 py-12 flex-1 flex items-center justify-center">
            <p>Write something to see the emotional landscape. Analysis updates automatically or on click.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Detected Tone</span>
                {/* Added break-words and hyphens-auto to prevent overflow */}
                <p className="text-lg font-medium text-gray-800 dark:text-gray-100 mt-1 break-words hyphens-auto">
                    {result.tone || 'Unknown'}
                </p>
            </div>
             <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Dominant Emotion</span>
                <p className="text-lg font-medium text-gray-800 dark:text-gray-100 mt-1 break-words hyphens-auto">
                    {getDominantEmotion()}
                </p>
            </div>
          </div>

          <div className="w-full h-72 min-h-[250px]">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4">Emotional Spectrum</h4>
            {result.emotion && result.emotion.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.emotion} layout="vertical" margin={{ left: 10, right: 10, bottom: 10 }}>
                    <XAxis type="number" hide domain={[0, 1]} />
                    <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                    <Tooltip 
                        contentStyle={{ 
                            borderRadius: '8px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            backgroundColor: '#ffffff',
                            color: '#374151'
                        }}
                        cursor={{fill: 'transparent'}}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20} animationDuration={1000}>
                        {result.emotion.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getEmotionColor(entry.score)} />
                        ))}
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    No emotional data detected.
                </div>
            )}
          </div>

          {result.suggestions && result.suggestions.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border border-blue-100 dark:border-blue-800">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Improvement Tips</h4>
              <ul className="list-disc list-inside space-y-1">
                {result.suggestions.map((tip, i) => (
                  <li key={i} className="text-sm text-blue-700 dark:text-blue-400">{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToneAnalyzer;
