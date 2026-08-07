import { createContext, useContext, useState, type ReactNode } from 'react';

type DemoRole = 'student' | 'faculty' | 'admin';

interface DemoContextType {
  isDemo: boolean;
  demoRole: DemoRole | null;
  showAuthModal: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  requireAuth: (callback?: () => void) => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ role, children }: { role: DemoRole; children: ReactNode }) {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const openAuthModal = () => setShowAuthModal(true);
  const closeAuthModal = () => setShowAuthModal(false);

  const requireAuth = (callback?: () => void) => {
    setShowAuthModal(true);
    // callback is intentionally ignored in demo mode — never execute
  };

  return (
    <DemoContext.Provider value={{
      isDemo: true,
      demoRole: role,
      showAuthModal,
      openAuthModal,
      closeAuthModal,
      requireAuth,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  return ctx;
}

export function useDemoGuard() {
  const demo = useDemo();
  return {
    isDemo: demo?.isDemo ?? false,
    requireAuth: demo?.requireAuth ?? (() => {}),
  };
}
