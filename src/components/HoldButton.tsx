'use client';

import { useRef, useState, useCallback } from 'react';

interface HoldButtonProps {
  label: string;
  holdLabel?: string;
  onConfirm: () => void;
  duration?: number;
  disabled?: boolean;
  className?: string;
}

export function HoldButton({
  label,
  holdLabel,
  onConfirm,
  duration = 1500,
  disabled = false,
  className,
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const confirmedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const handleStart = useCallback(() => {
    if (disabled) return;
    confirmedRef.current = false;
    setHolding(true);
    startTimeRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      confirmedRef.current = true;
      setProgress(0);
      setHolding(false);
      onConfirm();
    }, duration);
  }, [disabled, duration, onConfirm]);

  const handleEnd = useCallback(() => {
    if (confirmedRef.current) return;
    clear();
    setHolding(false);
    setProgress(0);
  }, [clear]);

  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      className={`hb-btn${holding ? ' hb-holding' : ''}${disabled ? ' hb-disabled' : ''} ${className ?? ''}`}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <span
        className="hb-fill"
        style={{ transform: `scaleX(${progress})` }}
      />
      <span className="hb-text">
        {holding && holdLabel ? holdLabel : label}
      </span>

      <span
        data-testid="hold-progress"
        data-progress={pct}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <style>{`
        .hb-btn {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 14px;
          background: #ef4444;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
          transition: transform 0.1s;
        }
        .hb-btn:active { transform: scale(0.98); }
        .hb-disabled { opacity: 0.5; cursor: not-allowed; }

        .hb-fill {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.25);
          transform-origin: left;
          transform: scaleX(0);
          transition: none;
          pointer-events: none;
        }

        .hb-text {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </button>
  );
}
