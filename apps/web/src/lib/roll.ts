import { useMutation } from "@tanstack/react-query";
import { create } from "zustand";
import type { RollDto, RollVisibility } from "@tavernlight/shared";
import { api } from "./api";
import { announce } from "./announce";

interface RollFeed {
  rolls: RollDto[];
  push: (r: RollDto) => void;
  clear: () => void;
}

/** Last rolls made from this browser (shown in the roll panel). */
export const useRollFeed = create<RollFeed>((set) => ({
  rolls: [],
  push: (r) => set((s) => ({ rolls: [r, ...s.rolls].slice(0, 20) })),
  clear: () => set({ rolls: [] }),
}));

export interface RollRequest {
  expression: string;
  label?: string;
  characterId?: string;
  campaignId?: string;
  visibility?: RollVisibility;
  advantage?: "advantage" | "disadvantage" | null;
}

export function describeRoll(r: RollDto): string {
  const crit = r.result.critical === "success" ? " — natural 20!" : r.result.critical === "failure" ? " — natural 1." : "";
  return `${r.label ?? r.expression}: ${r.result.total}${crit}`;
}

/** Rolls are always made by the server (secure random generator). */
export function useRoll() {
  const push = useRollFeed((s) => s.push);
  return useMutation({
    mutationFn: (req: RollRequest) => api.post<RollDto>("/dice/roll", { visibility: "public", ...req }),
    onSuccess: (r) => {
      push(r);
      announce(describeRoll(r));
    },
  });
}
