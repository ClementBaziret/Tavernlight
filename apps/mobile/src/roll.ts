import { useMutation } from "@tanstack/react-query";
import { AccessibilityInfo } from "react-native";
import type { RollDto } from "@tavernlight/shared";
import { api } from "./api";

export interface RollRequest {
  expression: string;
  label?: string;
  characterId?: string;
  advantage?: "advantage" | "disadvantage" | null;
}

export function describeRoll(r: RollDto): string {
  const crit = r.result.critical === "success" ? ", natural 20" : r.result.critical === "failure" ? ", natural 1" : "";
  return `${r.label ?? r.expression}: ${r.result.total}${crit}`;
}

/** Rolls are made by the server; the result is read by TalkBack. */
export function useRoll(onResult?: (r: RollDto) => void) {
  return useMutation({
    mutationFn: (req: RollRequest) => api.post<RollDto>("/dice/roll", { visibility: "public", ...req }),
    onSuccess: (r) => {
      AccessibilityInfo.announceForAccessibility(describeRoll(r));
      onResult?.(r);
    },
  });
}
