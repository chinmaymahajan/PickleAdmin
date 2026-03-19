import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface TourStep {
  target: string;       // data-tour attribute value
  title: string;
  description: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'player-manager',
    title: 'Add Your Players',
    description: 'Type names one by one or import from a spreadsheet. You need at least 4 players to get started.',
    position: 'bottom',
  },
  {
    target: 'court-manager',
    title: 'Set Up Courts',
    description: 'Enter the court numbers available for play. You need at least 1 court.',
    position: 'bottom',
  },
  {
    target: 'session-settings',
    title: 'Pick a Mode',
    description: (
      <>
        <strong>Manual</strong> — generate rounds one at a time and start each when you're ready. The timer is optional; if enabled, it counts down for the round duration.
        <br /><br />
        <strong>Auto</strong> — runs the whole session for you. Set the round length, number of rounds, and break time, and rounds advance automatically.
      </>
    ),
    position: 'left',
  },
  {
    target: 'start-session',
    title: 'Start Your Session',
    description: 'Court assignments are generated automatically, but you can drag and drop players to adjust them after each round is created.',
    position: 'top',
  },
];

const STORAGE_KEY = 'onboardingTourCompleted';

interface OnboardingTourProps {
  active: boolean;
  onComplete: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ active, onComplete }) => {
  const [step, setStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowClass, setArrowClass] = useState('');
  const tooltipRef = useRef<HTMLDivElement>(null);

  const positionTooltip = useCallback(() => {
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pos = current.position || 'bottom';
    const gap = 12;

    // Scroll element into view if needed
    if (el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    let top = 0;
    let left = 0;

    if (pos === 'bottom') {
      top = rect.bottom + gap + window.scrollY;
      left = rect.left + rect.width / 2 + window.scrollX;
    } else if (pos === 'top') {
      top = rect.top - gap + window.scrollY;
      left = rect.left + rect.width / 2 + window.scrollX;
    } else if (pos === 'left') {
      top = rect.top + rect.height / 2 + window.scrollY;
      left = rect.left - gap + window.scrollX;
    } else if (pos === 'right') {
      top = rect.top + rect.height / 2 + window.scrollY;
      left = rect.right + gap + window.scrollX;
    }

    const transform =
      pos === 'bottom' ? 'translate(-50%, 0)' :
      pos === 'top' ? 'translate(-50%, -100%)' :
      pos === 'left' ? 'translate(-100%, -50%)' :
      'translate(0, -50%)';

    setTooltipStyle({ position: 'absolute', top, left, transform });
    setArrowClass(`tour-arrow-${pos}`);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);
    return () => {
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
    };
  }, [active, step, positionTooltip]);

  // Highlight the current target element
  useEffect(() => {
    if (!active) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    if (el) {
      el.classList.add('tour-highlight');
      return () => { el.classList.remove('tour-highlight'); };
    }
  }, [active, step]);

  if (!active) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <>
      <div className="tour-overlay" onClick={handleSkip} />
      <div
        ref={tooltipRef}
        className={`tour-tooltip ${arrowClass}`}
        style={tooltipStyle}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}`}
      >
        <div className="tour-step-counter">{step + 1} / {TOUR_STEPS.length}</div>
        <h4 className="tour-title">{current.title}</h4>
        <p className="tour-description">{current.description}</p>
        <div className="tour-actions">
          <button className="tour-skip" onClick={handleSkip}>Skip tour</button>
          <button className="tour-next" onClick={handleNext}>
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
};

export { STORAGE_KEY };
export default OnboardingTour;
