import { useQuery } from "@tanstack/react-query";
import { RulesIndex, type RulesData } from "@tavernlight/engine";
import { api } from "./api";

const KINDS = ["skills", "conditions", "species", "backgrounds", "classes", "subclasses", "feats", "spells", "items"];

/** Same rules bundle and engine as the web app. */
export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: async () => new RulesIndex(await api.get<Partial<RulesData>>(`/rules/bundle?kinds=${KINDS.join(",")}`)),
    staleTime: Infinity,
  });
}
