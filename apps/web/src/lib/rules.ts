import { useQuery } from "@tanstack/react-query";
import { RulesIndex, type RulesData } from "@tavernlight/engine";
import { api } from "./api";

/** Everything needed to build and display characters. */
export const CHARACTER_KINDS = ["skills", "conditions", "species", "backgrounds", "classes", "subclasses", "feats", "spells", "items"];

export function useRules(kinds: string[] = CHARACTER_KINDS) {
  return useQuery({
    queryKey: ["rules", [...kinds].sort().join(",")],
    queryFn: async () => new RulesIndex(await api.get<Partial<RulesData>>(`/rules/bundle?kinds=${kinds.join(",")}`)),
    staleTime: Infinity,
  });
}
