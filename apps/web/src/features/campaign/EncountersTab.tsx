import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Difficulty, EncounterEvaluation } from "@tavernlight/engine";
import type { CampaignDetail, EncounterDto, MapSummary } from "@tavernlight/shared";
import { Alert, Badge, Button, Card, EmptyState, IconButton, NumberField, Select, Spinner, TextArea, TextField } from "@/components/ui";
import { MonsterFilters, useMonsterSearch } from "@/features/bestiary/BestiaryPage";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { crLabel } from "@/lib/format";

const TONES: Record<Difficulty, "neutral" | "success" | "info" | "accent" | "danger"> = { trivial: "neutral", easy: "success", medium: "info", hard: "accent", deadly: "danger" };

export function DifficultyBadge({ evaluation }: { evaluation: EncounterEvaluation }) {
  const { t } = useTranslation();
  const labels: Record<Difficulty, string> = {
    trivial: t("difficulty.trivial", "Trivial"),
    easy: t("difficulty.easy", "Easy"),
    medium: t("difficulty.medium", "Medium"),
    hard: t("difficulty.hard", "Hard"),
    deadly: t("difficulty.deadly", "Deadly"),
  };
  return <Badge tone={TONES[evaluation.difficulty]}>{labels[evaluation.difficulty]}</Badge>;
}

type EncounterWithEval = EncounterDto & { evaluation: EncounterEvaluation };

function Builder({ campaign, initial, onDone }: { campaign: CampaignDetail; initial: EncounterDto | null; onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [monsters, setMonsters] = useState<{ key: string; count: number; name: string; cr: number }[]>(initial?.monsters ?? []);
  const [filters, setFilters] = useState({ search: "", type: "any", size: "any", crMin: "any", crMax: "any" });
  const found = useMonsterSearch(filters);
  const [evaluation, setEvaluation] = useState<(EncounterEvaluation & { partyLevels: number[] }) | null>(null);

  useEffect(() => {
    if (!monsters.length) {
      setEvaluation(null);
      return;
    }
    const id = setTimeout(() => {
      void api
        .post<EncounterEvaluation & { partyLevels: number[] }>(`/campaigns/${campaign.id}/encounters/evaluate`, { monsters: monsters.map((m) => ({ key: m.key, count: m.count })) })
        .then((e) => {
          setEvaluation(e);
          announce(t("encounter.difficultyNow", "Difficulty: {{d}}", { d: e.difficulty }));
        });
    }, 300);
    return () => clearTimeout(id);
  }, [monsters, campaign.id, t]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, monsters: monsters.map((m) => ({ key: m.key, count: m.count })) };
      return initial ? api.put(`/campaigns/${campaign.id}/encounters/${initial.id}`, body) : api.post(`/campaigns/${campaign.id}/encounters`, body);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["encounters", campaign.id] });
      onDone();
    },
  });

  const add = (m: { key: string; name: string; cr: number }) =>
    setMonsters((list) => (list.some((x) => x.key === m.key) ? list.map((x) => (x.key === m.key ? { ...x, count: x.count + 1 } : x)) : [...list, { ...m, count: 1 }]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">{initial ? t("encounter.edit", "Edit the encounter") : t("encounter.new", "New encounter")}</h3>
        <TextField label={t("notes.title", "Title")} value={name} onChange={setName} isRequired />
        <TextArea label={t("editor.description", "Description")} value={description} onChange={setDescription} rows={2} />
        {monsters.length === 0 ? (
          <p className="text-muted">{t("encounter.addHelp", "Add monsters from the list.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {monsters.map((m) => (
              <li key={m.key} className="flex flex-wrap items-end gap-2">
                <NumberField
                  label={`${m.name} (CR ${crLabel(m.cr)})`}
                  value={m.count}
                  minValue={0}
                  maxValue={50}
                  onChange={(count) => setMonsters((list) => (count === 0 ? list.filter((x) => x.key !== m.key) : list.map((x) => (x.key === m.key ? { ...x, count } : x))))}
                  className="w-64"
                />
              </li>
            ))}
          </ul>
        )}
        {evaluation && (
          <div role="status" className="rounded-lg bg-surface-2 p-3">
            <p className="flex items-center gap-2">
              {t("encounter.difficulty", "Difficulty")}: <DifficultyBadge evaluation={evaluation} />
            </p>
            <p className="text-sm text-muted">
              {t("encounter.details", "{{xp}} XP × {{m}} = {{adj}} adjusted XP · party of {{n}} (levels {{levels}}): easy {{e}}, medium {{me}}, hard {{h}}, deadly {{d}}", {
                xp: evaluation.baseXp,
                m: evaluation.multiplier,
                adj: evaluation.adjustedXp,
                n: evaluation.partyLevels.length,
                levels: evaluation.partyLevels.join(", ") || "—",
                e: evaluation.partyThresholds.easy,
                me: evaluation.partyThresholds.medium,
                h: evaluation.partyThresholds.hard,
                d: evaluation.partyThresholds.deadly,
              })}
            </p>
          </div>
        )}
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex gap-2">
          <Button variant="primary" onPress={() => save.mutate()} isDisabled={!name || !monsters.length} loading={save.isPending}>
            {t("common.save", "Save")}
          </Button>
          <Button onPress={onDone}>{t("common.cancel", "Cancel")}</Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <MonsterFilters value={filters} onChange={setFilters} />
        {found.isLoading ? (
          <Spinner />
        ) : (
          <ul className="flex max-h-[28rem] flex-col gap-1 overflow-auto">
            {found.data?.slice(0, 80).map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1">
                <span>
                  {m.name} <span className="text-sm text-muted">· CR {crLabel(m.cr)} · {m.xp} XP</span>
                </span>
                <IconButton size="sm" variant="secondary" label={t("encounter.addMonster", "Add {{name}}", { name: m.name })} onPress={() => add(m)}>
                  <Plus aria-hidden className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function EncountersTab({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const encounters = useQuery({ queryKey: ["encounters", campaign.id], queryFn: () => api.get<EncounterWithEval[]>(`/campaigns/${campaign.id}/encounters`) });
  const maps = useQuery({ queryKey: ["maps", campaign.id], queryFn: () => api.get<MapSummary[]>(`/campaigns/${campaign.id}/maps`) });
  const [editing, setEditing] = useState<EncounterDto | "new" | null>(null);
  const [mapFor, setMapFor] = useState<Record<string, string>>({});
  const place = useMutation({
    mutationFn: ({ id, mapId }: { id: string; mapId: string }) => api.post(`/campaigns/${campaign.id}/encounters/${id}/place`, { mapId, hidden: false }),
    onSuccess: (_d, v) => announce(t("encounter.placed", "Encounter placed on {{map}}", { map: maps.data?.find((m) => m.id === v.mapId)?.name })),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/campaigns/${campaign.id}/encounters/${id}`), onSuccess: () => void client.invalidateQueries({ queryKey: ["encounters", campaign.id] }) });

  if (editing) return <Builder campaign={campaign} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" className="self-start" onPress={() => setEditing("new")}>
        <Plus aria-hidden className="h-4 w-4" />
        {t("encounter.new", "New encounter")}
      </Button>
      {place.error && <Alert tone="danger">{errorMessage(place.error)}</Alert>}
      {encounters.isLoading ? (
        <Spinner />
      ) : !encounters.data?.length ? (
        <EmptyState title={t("encounter.none", "No encounter yet")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {encounters.data.map((e) => {
            const mapId = mapFor[e.id] ?? e.mapId ?? maps.data?.[0]?.id ?? null;
            return (
              <Card as="li" key={e.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{e.name}</h3>
                  <DifficultyBadge evaluation={e.evaluation} />
                </div>
                <p className="text-sm">{e.monsters.map((m) => `${m.count} × ${m.name}`).join(", ")}</p>
                <p className="text-sm text-muted">{t("encounter.xp", "{{xp}} XP ({{per}} per character)", { xp: e.evaluation.baseXp, per: e.evaluation.xpPerCharacter })}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select label={t("encounter.map", "Map")} value={mapId} onChange={(v) => setMapFor({ ...mapFor, [e.id]: v })} options={(maps.data ?? []).map((m) => ({ id: m.id, label: m.name }))} className="w-56" />
                  <Button size="sm" variant="accent" isDisabled={!mapId} onPress={() => mapId && place.mutate({ id: e.id, mapId })} loading={place.isPending && place.variables?.id === e.id}>
                    <MapPin aria-hidden className="h-4 w-4" />
                    {t("encounter.place", "Place on the map")}
                  </Button>
                  {mapId && place.isSuccess && place.variables?.id === e.id && (
                    <Link to="/campaigns/$id/maps/$mapId" params={{ id: campaign.id, mapId }} className="text-sm underline">
                      {t("encounter.seeMap", "See the map")}
                    </Link>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onPress={() => setEditing(e)}>
                    {t("campaign.edit", "Edit")}
                  </Button>
                  <IconButton size="sm" label={t("notes.delete", "Delete {{t}}", { t: e.name })} onPress={() => remove.mutate(e.id)}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </IconButton>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
