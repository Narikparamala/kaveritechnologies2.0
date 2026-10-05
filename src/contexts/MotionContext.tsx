import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type MotionPreference = 'system' | 'on' | 'off';

interface MotionContextType {
  preference: MotionPreference;
  setPreference: (p: MotionPreference) => void;
  /** True when decorative motion should be minimised (explicit setting, or the
   *  device's prefers-reduced-motion accessibility setting while on "system"). */
  reduced: boolean;
}

const MotionContext = createContext<MotionContextType | undefined>(undefined);

const STORAGE_KEY = 'reduce-motion';

function systemPrefersReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<MotionPreference>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'on' || stored === 'off' || stored === 'system' ? stored : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemReduced, setSystemReduced] = useState(systemPrefersReduced);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setPreference = (p: MotionPreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* private mode — the in-memory preference still applies */
    }
  };

  const reduced = preference === 'on' || (preference === 'system' && systemReduced);

  const value = useMemo(() => ({ preference, setPreference, reduced }), [preference, reduced]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useAppMotion() {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useAppMotion must be used within MotionProvider');
  return ctx;
}
