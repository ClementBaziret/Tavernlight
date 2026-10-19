import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Copy, Crown, Map as MapIcon, MonitorPlay, Plus, RefreshCw, Swords, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { emptyMap } from "@tavernlight/engine";
import type { CampaignDetail, CharacterSummary, DocumentDto, MapDto, MapSummary, NoteDto, NoteKind } from "@tavernlight/shared";
import { Alert, Badge, Button, buttonClass, Card, EmptyState, IconButton, ModalDialog, NumberField, PageHeader, RadioGroup, Select, Spinner, Tabs, TextArea, TextField } from "@/components/ui";
import { CharacterCard } from "@/features/home/HomePage";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { useMe } from "@/lib/auth";
import { EncountersTab } from "./EncountersTab";

function Overview({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { data: me } = useMe();
  const characters = useQuery({ queryKey: ["characters"], queryFn: () => api.get<CharacterSummary[]>("/characters") });
  const [attach, setAttach] = useState<string | null>(null);
  const refresh = (c: CampaignDetail) => client.setQueryData(["campaign", campaign.id], c);
  const regenerate = useMutation({ mutationFn: () => api.post<CampaignDetail>(`/campaigns/${campaign.id}/invite-code`), onSuccess: refresh });
  const attachMutation = useMutation({ mutationFn: (characterId: string) => api.post<CampaignDetail>(`/campaigns/${campaign.id}/characters`, { characterId }), onSuccess: refresh });
  const detach = useMutation({ mutationFn: (characterId: string) => api.delete<CampaignDetail>(`/campaigns/${campaign.id}/characters/${characterId}`), onSuccess: refresh });
  const link = campaign.inviteCode ? `${window.location.origin}/join/${campaign.inviteCode}` : null;
  const free = (characters.data ?? []).filter((c) => c.ownerId === me?.id && !c.campaignId);

  return (
    <div className="flex flex-col gap-6">
      {campaign.description && <p className="max-w-3xl whitespace-pre-line">{campaign.description}</p>}
      <div className="flex flex-wrap gap-2">
        {campaign.role === "gm" && (
          <Link to="/campaigns/$id/table" params={{ id: campaign.id }} className={buttonClass("accent")}>
            <Swords aria-hidden className="h-4 w-4" />
            {t("campaign.openTable", "Open the GM table")}
          </Link>
        )}
        <a href={`/campaigns/${campaign.id}/players`} target="tavernlight-players" className={buttonClass("secondary")}>
          <MonitorPlay aria-hidden className="h-4 w-4" />
          {t("campaign.playersView", "Open the players' view (second screen)")}
        </a>
      </div>
      {campaign.role === "gm" && link && (
        <Card aria-labelledby="invite-title" className="flex flex-col gap-2">
          <h2 id="invite-title" className="font-display text-xl font-semibold">
            {t("campaign.invite", "Invite players")}
          </h2>
          <p>
            {t("campaign.code", "Code")}: <strong className="font-mono text-xl tracking-widest">{campaign.inviteCode}</strong>
          </p>
          <p className="break-all text-sm text-muted">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onPress={async () => {
                await navigator.clipboard.writeText(link);
                announce(t("campaign.copied", "Invitation link copied"));
              }}
            >
              <Copy aria-hidden className="h-4 w-4" />
              {t("campaign.copy", "Copy the link")}
            </Button>
            <Button size="sm" onPress={() => regenerate.mutate()} loading={regenerate.isPending}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              {t("campaign.newCode", "New code")}
            </Button>
          </div>
        </Card>
      )}
      <section aria-labelledby="party-title">
        <h2 id="party-title" className="mb-3 font-display text-xl font-semibold">
          {t("campaign.party", "The party")}
        </h2>
        {campaign.characters.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {campaign.characters.map((c) => (
              <div key={c.id} className="flex flex-col gap-1">
                <CharacterCard c={c} />
                <p className="text-sm text-muted">{t("campaign.playedBy", "Played by {{name}}", { name: c.ownerName })}</p>
                {(campaign.role === "gm" || c.ownerId === me?.id) && (
                  <Button size="sm" variant="ghost" onPress={() => detach.mutate(c.id)}>
                    {t("campaign.removeCharacter", "Remove from the campaign")}
                  </Button>
                )}
              </div>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("campaign.noCharacters", "No character yet")} />
        )}
        {free.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Select label={t("campaign.addMine", "Add one of my characters")} value={attach} onChange={setAttach} options={free.map((c) => ({ id: c.id, label: c.name }))} className="w-72" />
            <Button isDisabled={!attach} onPress={() => attach && attachMutation.mutate(attach)} loading={attachMutation.isPending}>
              {t("campaign.add", "Add")}
            </Button>
          </div>
        )}
        {attachMutation.error && <Alert tone="danger">{errorMessage(attachMutation.error)}</Alert>}
      </section>
      <section aria-labelledby="members-title">
        <h2 id="members-title" className="mb-2 font-display text-xl font-semibold">
          {t("campaign.members", "Members")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {campaign.members.map((m) => (
            <li key={m.userId}>
              <Badge tone={m.role === "gm" ? "accent" : "neutral"}>
                {m.role === "gm" && <Crown aria-hidden className="h-3 w-3" />}
                {m.displayName} · {m.role === "gm" ? t("roles.gm", "Game master") : t("roles.player", "Player")}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MapsTab({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const maps = useQuery({ queryKey: ["maps", campaign.id], queryFn: () => api.get<MapSummary[]>(`/campaigns/${campaign.id}/maps`) });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"square" | "hex">("square");
  const [cols, setCols] = useState(30);
  const [rows, setRows] = useState(20);
  const create = useMutation({
    mutationFn: () => api.post<MapDto>(`/campaigns/${campaign.id}/maps`, { name, description: "", data: emptyMap(cols, rows, type) }),
    onSuccess: (m) => {
      void client.invalidateQueries({ queryKey: ["maps", campaign.id] });
      void navigate({ to: "/campaigns/$id/maps/$mapId", params: { id: campaign.id, mapId: m.id } });
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/campaigns/${campaign.id}/maps/${id}`), onSuccess: () => void client.invalidateQueries({ queryKey: ["maps", campaign.id] }) });
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" className="self-start" onPress={() => setOpen(true)}>
        <Plus aria-hidden className="h-4 w-4" />
        {t("campaign.newMap", "New map")}
      </Button>
      {maps.isLoading ? (
        <Spinner />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.data?.map((m) => (
            <Card as="li" key={m.id} className="flex flex-col gap-2">
              <h3 className="font-display text-lg font-semibold">
                <MapIcon aria-hidden className="mr-1 inline h-4 w-4" />
                {m.name}
                {campaign.activeMapId === m.id && (
                  <Badge tone="success" className="ml-2">
                    {t("campaign.onTable", "on the table")}
                  </Badge>
                )}
              </h3>
              <p className="text-sm text-muted">
                {m.gridType === "hex" ? t("textview.hex", "Hexagonal") : t("textview.square", "Square")} · {m.cols} × {m.rows}
              </p>
              <p className="line-clamp-2 text-sm">{m.description}</p>
              <div className="flex gap-2">
                <Link to="/campaigns/$id/maps/$mapId" params={{ id: campaign.id, mapId: m.id }} className={buttonClass("secondary", "sm")}>
                  {t("campaign.edit", "Edit")}
                </Link>
                <IconButton size="sm" label={t("campaign.deleteMap", "Delete {{name}}", { name: m.name })} onPress={() => window.confirm(t("campaign.confirmDelete", "Delete this map?")) && remove.mutate(m.id)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </IconButton>
              </div>
            </Card>
          ))}
        </ul>
      )}
      <ModalDialog isOpen={open} onOpenChange={setOpen} title={t("campaign.newMap", "New map")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <TextField label={t("editor.name", "Name")} value={name} onChange={setName} isRequired autoFocus />
          <RadioGroup
            label={t("editor.gridType", "Grid")}
            orientation="horizontal"
            value={type}
            onChange={(v) => setType(v as "square" | "hex")}
            options={[
              { id: "square", label: t("textview.square", "Square") },
              { id: "hex", label: t("textview.hex", "Hexagonal") },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t("editor.cols", "Columns")} value={cols} minValue={4} maxValue={120} onChange={setCols} />
            <NumberField label={t("editor.rows", "Rows")} value={rows} minValue={4} maxValue={120} onChange={setRows} />
          </div>
          <Button type="submit" variant="primary" loading={create.isPending}>
            {t("home.create", "Create")}
          </Button>
        </form>
      </ModalDialog>
    </div>
  );
}

const NOTE_KINDS: { id: NoteKind; label: string }[] = [
  { id: "npc", label: "NPCs" },
  { id: "place", label: "Places" },
  { id: "quest", label: "Quests" },
  { id: "note", label: "Notes" },
];

function NotesTab({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [kind, setKind] = useState<NoteKind>("npc");
  const [editing, setEditing] = useState<Partial<NoteDto> | null>(null);
  const notes = useQuery({ queryKey: ["notes", campaign.id], queryFn: () => api.get<NoteDto[]>(`/campaigns/${campaign.id}/notes`) });
  const save = useMutation({
    mutationFn: (n: Partial<NoteDto>) =>
      n.id ? api.put<NoteDto>(`/campaigns/${campaign.id}/notes/${n.id}`, { kind: n.kind, title: n.title, body: n.body, status: n.status ?? undefined }) : api.post<NoteDto>(`/campaigns/${campaign.id}/notes`, { kind: n.kind, title: n.title, body: n.body, status: n.status ?? undefined }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notes", campaign.id] });
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/campaigns/${campaign.id}/notes/${id}`), onSuccess: () => void client.invalidateQueries({ queryKey: ["notes", campaign.id] }) });
  const list = (notes.data ?? []).filter((n) => n.kind === kind);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <RadioGroup label={t("notes.kind", "Show")} orientation="horizontal" value={kind} onChange={(v) => setKind(v as NoteKind)} options={NOTE_KINDS.map((k) => ({ id: k.id, label: t(`notes.${k.id}`, k.label) }))} />
        <Button variant="primary" onPress={() => setEditing({ kind, title: "", body: "" })}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("notes.add", "Add")}
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title={t("notes.empty", "Nothing here yet")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((n) => (
            <Card as="li" key={n.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{n.title}</h3>
                {n.status && <Badge>{n.status}</Badge>}
              </div>
              <p className="whitespace-pre-line text-sm">{n.body}</p>
              <div className="flex gap-2">
                <Button size="sm" onPress={() => setEditing(n)}>
                  {t("campaign.edit", "Edit")}
                </Button>
                <IconButton size="sm" label={t("notes.delete", "Delete {{t}}", { t: n.title })} onPress={() => remove.mutate(n.id)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </IconButton>
              </div>
            </Card>
          ))}
        </ul>
      )}
      <ModalDialog isOpen={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? t("notes.edit", "Edit") : t("notes.add", "Add")}>
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <Select label={t("notes.kindLabel", "Kind")} value={editing.kind ?? "note"} onChange={(v) => setEditing({ ...editing, kind: v as NoteKind })} options={NOTE_KINDS.map((k) => ({ id: k.id, label: t(`notes.${k.id}`, k.label) }))} />
            <TextField label={t("notes.title", "Title")} value={editing.title ?? ""} onChange={(v) => setEditing({ ...editing, title: v })} isRequired />
            <TextField label={t("notes.status", "Status (optional)")} value={editing.status ?? ""} onChange={(v) => setEditing({ ...editing, status: v })} />
            <TextArea label={t("notes.body", "Text")} value={editing.body ?? ""} onChange={(v) => setEditing({ ...editing, body: v })} rows={6} />
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t("common.save", "Save")}
            </Button>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}

export function DocumentsTab({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const docs = useQuery({ queryKey: ["documents", campaign.id], queryFn: () => api.get<DocumentDto[]>(`/campaigns/${campaign.id}/documents`) });
  const [editing, setEditing] = useState<Partial<DocumentDto> | null>(null);
  const save = useMutation({
    mutationFn: (d: Partial<DocumentDto>) =>
      d.id ? api.put(`/campaigns/${campaign.id}/documents/${d.id}`, { title: d.title, body: d.body, assetId: d.assetId ?? null }) : api.post(`/campaigns/${campaign.id}/documents`, { title: d.title, body: d.body, assetId: d.assetId ?? null }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["documents", campaign.id] });
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/campaigns/${campaign.id}/documents/${id}`), onSuccess: () => void client.invalidateQueries({ queryKey: ["documents", campaign.id] }) });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t("docs.help", "Letters, images and clues to reveal on the players' view during the game (from the GM table).")}</p>
      <Button variant="primary" className="self-start" onPress={() => setEditing({ title: "", body: "" })}>
        <Plus aria-hidden className="h-4 w-4" />
        {t("docs.add", "New document")}
      </Button>
      <ul className="grid gap-3 md:grid-cols-2">
        {docs.data?.map((d) => (
          <Card as="li" key={d.id} className="flex flex-col gap-2">
            <h3 className="font-display text-lg font-semibold">
              {d.title} {d.revealed && <Badge tone="success">{t("docs.revealed", "revealed")}</Badge>}
            </h3>
            {d.assetId && <img src={`/api/assets/${d.assetId}`} alt={d.title} className="max-h-40 self-start rounded-lg border border-line" />}
            <p className="whitespace-pre-line text-sm">{d.body}</p>
            <div className="flex gap-2">
              <Button size="sm" onPress={() => setEditing(d)}>
                {t("campaign.edit", "Edit")}
              </Button>
              <IconButton size="sm" label={t("notes.delete", "Delete {{t}}", { t: d.title })} onPress={() => remove.mutate(d.id)}>
                <Trash2 aria-hidden className="h-4 w-4" />
              </IconButton>
            </div>
          </Card>
        ))}
      </ul>
      <ModalDialog isOpen={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? t("notes.edit", "Edit") : t("docs.add", "New document")}>
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <TextField label={t("notes.title", "Title")} value={editing.title ?? ""} onChange={(v) => setEditing({ ...editing, title: v })} isRequired />
            <TextArea label={t("notes.body", "Text")} value={editing.body ?? ""} onChange={(v) => setEditing({ ...editing, body: v })} rows={6} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("docs.image", "Image (optional)")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const asset = await api.upload<{ id: string }>(`/assets?campaignId=${campaign.id}`, file);
                  setEditing((d) => ({ ...d, assetId: asset.id }));
                }}
              />
            </label>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t("common.save", "Save")}
            </Button>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}

export function CampaignPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api.get<CampaignDetail>(`/campaigns/${id}`) });
  if (campaign.isLoading) return <Spinner />;
  if (campaign.error || !campaign.data) return <Alert tone="danger">{errorMessage(campaign.error)}</Alert>;
  const c = campaign.data;
  const tabs = [{ id: "overview", label: t("campaign.overview", "Overview"), content: <Overview campaign={c} /> }];
  if (c.role === "gm") {
    tabs.push(
      { id: "maps", label: t("campaign.maps", "Maps"), content: <MapsTab campaign={c} /> },
      { id: "encounters", label: t("campaign.encounters", "Encounters"), content: <EncountersTab campaign={c} /> },
      { id: "notes", label: t("campaign.notes", "Notes, NPCs, places, quests"), content: <NotesTab campaign={c} /> },
      { id: "documents", label: t("campaign.documents", "Documents"), content: <DocumentsTab campaign={c} /> },
    );
  }
  return (
    <div>
      <PageHeader title={c.name} subtitle={c.role === "gm" ? t("campaign.youAreGm", "You are the game master") : t("campaign.youArePlayer", "You are a player")} />
      <Tabs label={t("campaign.sections", "Campaign sections")} tabs={tabs} selected={search.tab ?? "overview"} onSelect={(tab) => void navigate({ to: "/campaigns/$id", params: { id }, search: { tab }, replace: true })} />
    </div>
  );
}
