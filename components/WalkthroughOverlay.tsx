
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

export interface TourStep {
  targetSelector: string;
  title: string;
  description: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onStepEnter?: () => void;
}

interface WalkthroughOverlayProps {
  steps: TourStep[];
  onClose: () => void;
  onComplete: () => void;
}

const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({ steps, onClose, onComplete }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [opacity, setOpacity] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const step = steps[currentStepIndex];
  const pollRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    // Trigger step specific logic
    if (step.onStepEnter) {
        step.onStepEnter();
    }

    // Reset state for new step searching, but keep opacity high if we want a smooth transition between visible elements
    // Only fade out if we are truly lost or switching contexts significantly
    let isFound = false;

    const updatePosition = () => {
        const elements = document.querySelectorAll(step.targetSelector);
        let targetEl: Element | null = null;

        // Find the first visible element matching the selector
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            if (el.offsetParent !== null && el.getBoundingClientRect().width > 0) {
                targetEl = el;
                break;
            }
        }

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            
            // Robust check to avoid jitter
            setTargetRect(prev => {
                if (!prev || 
                    Math.abs(prev.top - rect.top) > 1 || 
                    Math.abs(prev.left - rect.left) > 1 ||
                    Math.abs(prev.width - rect.width) > 1 ||
                    Math.abs(prev.height - rect.height) > 1) {
                    return rect;
                }
                return prev;
            });
            
            calculateTooltipPosition(rect, step.position);
            
            if (!isFound) {
                 setOpacity(1);
                 setIsReady(true);
                 isFound = true;
            }
            return true; 
        }
        return false; 
    };

    // Initial polling to catch elements that animate in
    clearInterval(pollRef.current);
    pollRef.current = window.setInterval(updatePosition, 50);
    
    // Immediate check
    updatePosition();

    // Setup Resize Observer for responsive updates
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => updatePosition());
    resizeObserverRef.current.observe(document.body);
    
    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
        window.removeEventListener('scroll', handleScroll, true);
        clearInterval(pollRef.current);
        if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    };
  }, [currentStepIndex, step]);

  const calculateTooltipPosition = (rect: DOMRect, preferredPos: string = 'bottom') => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const isMobile = viewportWidth < 768;

      const tooltipWidth = isMobile ? viewportWidth - 32 : 384; // Full width - padding on mobile
      const tooltipHeightEstimate = isMobile ? 200 : 240;
      
      const gap = isMobile ? 20 : 32; 
      const padding = 16; 
      
      let top = 0;
      let left = 0;

      const getCoords = (pos: string) => {
          let t = 0, l = 0;
          switch (pos) {
              case 'bottom':
                  t = rect.bottom + gap;
                  l = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                  break;
              case 'top':
                  t = rect.top - gap - tooltipHeightEstimate;
                  l = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                  break;
              case 'right':
                  t = rect.top + (rect.height / 2) - (tooltipHeightEstimate / 2);
                  l = rect.right + gap;
                  break;
              case 'left':
                  t = rect.top + (rect.height / 2) - (tooltipHeightEstimate / 2);
                  l = rect.left - gap - tooltipWidth;
                  break;
          }
          return { t, l };
      }

      // Check overlaps
      const doesOverlapTarget = (t: number, l: number, w: number, h: number) => {
          const buffer = 5; // Small buffer
          const toolRight = l + w;
          const toolBottom = t + h;
          const targetRight = rect.right - buffer; // Relaxed edges
          const targetBottom = rect.bottom - buffer;
          const targetLeft = rect.left + buffer;
          const targetTop = rect.top + buffer;

          return !(l > targetRight || toolRight < targetLeft || t > targetBottom || toolBottom < targetTop);
      };

      const isOffScreen = (t: number, l: number, w: number, h: number) => {
          return (l < 0 || l + w > viewportWidth || t < 0 || t + h > viewportHeight);
      };

      // Strategy:
      // 1. Try preferred position
      // 2. Try all other positions
      // 3. On mobile, fallback to anchored bottom/top if everything fails
      
      const positions = ['bottom', 'top', 'right', 'left'];
      // Sort to put preferred first
      positions.sort((a, b) => (a === preferredPos ? -1 : b === preferredPos ? 1 : 0));

      let bestCoords = getCoords(preferredPos);
      let bestScore = -Infinity;

      for (const pos of positions) {
          const { t, l } = getCoords(pos);
          let score = 0;
          
          // Heavily penalize off-screen
          if (isOffScreen(t, l, tooltipWidth, tooltipHeightEstimate)) score -= 1000;
          
          // Heavily penalize overlapping the highlight
          if (doesOverlapTarget(t, l, tooltipWidth, tooltipHeightEstimate)) score -= 2000;
          
          // Slight bonus for preferred
          if (pos === preferredPos) score += 50;

          if (score > bestScore) {
              bestScore = score;
              bestCoords = { t, l };
          }
      }

      top = bestCoords.t;
      left = bestCoords.l;

      // --- MOBILE SAFEGUARD ---
      // If we are on mobile and the best position is still overlapping or offscreen (low score),
      // force it to the bottom or top of the screen safely away from the highlight center.
      if (isMobile && bestScore < 0) {
          const highlightCenterY = rect.top + rect.height / 2;
          const screenCenterY = viewportHeight / 2;

          // If highlighted element is in top half, put tooltip at bottom
          if (highlightCenterY < screenCenterY) {
               top = viewportHeight - tooltipHeightEstimate - padding - 20; // Safe area from bottom
          } else {
               top = padding + 60; // Safe area from top
          }
          // Center horizontally
          left = (viewportWidth - tooltipWidth) / 2;
      }

      // --- FINAL CLAMPING ---
      // Ensure it never goes totally off screen
      const effectiveWidth = Math.min(tooltipWidth, viewportWidth - (padding * 2));
      
      if (left < padding) left = padding;
      if (left + effectiveWidth > viewportWidth - padding) {
          left = viewportWidth - effectiveWidth - padding;
      }
      
      // Vertical clamping
      if (top < padding) top = padding;
      if (top + 50 > viewportHeight) { // Allow it to be a bit tall, but header must be visible
          top = viewportHeight - tooltipHeightEstimate - padding;
      }

      setTooltipStyle({
          top: `${top}px`,
          left: `${left}px`,
          position: 'fixed',
          width: isMobile ? 'calc(100% - 32px)' : '384px',
          maxWidth: '100%',
          transform: 'translateZ(0)', // Hardware accel
          zIndex: 9999
      });
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  // Use a spring-like bezier for fluid "flying" effect
  const transitionStyle = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
       {/* Spotlight Box */}
       {targetRect && (
           <div 
             className="absolute rounded-lg pointer-events-none"
             style={{
                 top: targetRect.top - 8,
                 left: targetRect.left - 8,
                 width: targetRect.width + 16,
                 height: targetRect.height + 16,
                 // Huge shadow acts as the dimmer
                 boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75), 0 0 30px rgba(234, 179, 8, 0.3)', 
                 border: '2px solid rgba(234, 179, 8, 0.9)',
                 opacity: opacity,
                 transition: transitionStyle
             }}
           />
       )}

       {/* Tooltip Card */}
       <div 
         className="absolute bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 pointer-events-auto flex flex-col"
         style={{ 
             ...tooltipStyle, 
             opacity: opacity,
             transition: `${transitionStyle}, opacity 0.3s ease-out`,
             // Scale effect only on initial mount or drastic disappear
             transform: isReady ? 'scale(1)' : 'scale(0.95)' 
         }}
       >
          <div className="flex justify-between items-start mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-accent">
                  Step {currentStepIndex + 1} of {steps.length}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1">
                  <X size={18} />
              </button>
          </div>
          
          <h3 className="text-xl font-serif font-bold text-gray-900 dark:text-white mb-2">
              {step.title}
          </h3>
          
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
              {step.description}
          </div>

          <div className="flex justify-between items-center mt-auto">
               <button 
                 onClick={handlePrev} 
                 disabled={currentStepIndex === 0}
                 className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30 flex items-center gap-1 px-2 py-1 transition-colors"
               >
                  <ArrowLeft size={14} /> Back
               </button>
               
               <button 
                 onClick={handleNext}
                 className="px-5 py-2 bg-accent text-white rounded-xl font-medium shadow-lg shadow-accent/20 hover:bg-amber-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-sm"
               >
                 {currentStepIndex === steps.length - 1 ? (
                     <>Let's Forge <Check size={16} /></>
                 ) : (
                     <>Next <ArrowRight size={16} /></>
                 )}
               </button>
          </div>
       </div>
    </div>,
    document.body
  );
};

export default WalkthroughOverlay;
