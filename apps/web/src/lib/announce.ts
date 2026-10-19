import { create } from "zustand";

interface Announcer {
  message: string;
  politeness: "polite" | "assertive";
  counter: number;
  announce: (message: string, politeness?: "polite" | "assertive") => void;
}

/** Messages read by screen readers through the live region in the layout. */
export const useAnnouncer = create<Announcer>((set) => ({
  message: "",
  politeness: "polite",
  counter: 0,
  announce: (message, politeness = "polite") => set((s) => ({ message, politeness, counter: s.counter + 1 })),
}));

export const announce = (message: string, politeness: "polite" | "assertive" = "polite") => useAnnouncer.getState().announce(message, politeness);
