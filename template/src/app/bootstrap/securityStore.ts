import { create } from 'zustand';

export type SecurityReason = 'ssl' | 'jailbroken' | 'debugMode' | 'hookDetected';

type SecurityState = {
  /** Set when a compromise is detected at runtime (e.g. an SSL pin mismatch after startup). */
  compromisedReasons: SecurityReason[];
  reportCompromise: (reason: SecurityReason) => void;
};

/** Holds runtime security findings; the app root shows the blocking screen when any exist. */
export const useSecurityStore = create<SecurityState>()((set) => ({
  compromisedReasons: [],
  reportCompromise: (reason) => {
    set((state) =>
      state.compromisedReasons.includes(reason)
        ? state
        : { compromisedReasons: [...state.compromisedReasons, reason] },
    );
  },
}));
