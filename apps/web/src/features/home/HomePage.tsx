import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Crown, Plus, Swords, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CampaignDetail, CampaignSummary, CharacterSummary } from "@tavernlight/shared";
import { Logo } from "@/components/Layout";
import { Alert, Badge, Button, buttonClass, Card, EmptyState, HpBar, ModalDialog, PageHeader, Spinner, TextArea, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";

function Landing() {
  const { t } = useTranslation();
  const features = [
    [t("landing.f1t", "Characters by the rules"), t("landing.f1", "A step-by-step builder checks every choice and computes armor class, hit points, saves and spell slots for you.")],
    [t("landing.f2t", "Two screens, one game"), t("landing.f2", "The game master runs the table on a laptop; a second window on the TV shows only what the characters see.")],
    [t("landing.f3t", "Assisted combat"), t("landing.f3", "Attacks, saves, damage and conditions are resolved from the rules data — and the game master can always adjust or undo.")],
    [t("landing.f4t", "Maps with vision"), t("landing.f4", "Square or hex grids, walls and doors, fog of war revealed by line of sight.")],
  ];
  return (
    <div className="flex flex-col gap-10 py-6">
      <section className="flex flex-col items-center gap-4 text-center">
        <Logo className="h-20 w-20" />
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Tavernlight</h1>
        <p className="max-w-2xl text-lg text-muted">{t("landing.tagline", "Your fantasy role-playing table, lit up: characters, maps, monsters, dice and combat on two synchronized screens. Compatible with the 5th edition.")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/register" className={buttonClass("accent")}>
            {t("landing.start", "Create an account")}
          </Link>
          <Link to="/login" className={buttonClass("secondary")}>
            {t("nav.login", "Log in")}
          </Link>
        </div>
      </section>
      <ul className="grid gap-4 sm:grid-cols-2">
        {features.map(([title, text]) => (
          <Card as="li" key={title}>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-muted">{text}</p>
          </Card>
        ))}
      </ul>
    </div>
  );
}

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<CampaignDetail>("/campaigns", { name, description }),
    onSuccess: (c) => {
      void client.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
      void navigate({ to: "/campaigns/$id", params: { id: c.id } });
    },
  });
  return (
    <ModalDialog isOpen={open} onOpenChange={onOpenChange} title={t("home.newCampaign", "New campaign")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        <TextField label={t("home.campaignName", "Name")} value={name} onChange={setName} isRequired autoFocus />
        <TextArea label={t("home.campaignDescription", "Description")} value={description} onChange={setDescription} />
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t("home.create", "Create")}
        </Button>
      </form>
    </ModalDialog>
  );
}

function JoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <ModalDialog isOpen={open} onOpenChange={onOpenChange} title={t("home.joinTitle", "Join a campaign")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onOpenChange(false);
          void navigate({ to: "/join/$code", params: { code: code.trim().toUpperCase() } });
        }}
      >
        <TextField label={t("home.code", "Invitation code")} value={code} onChange={setCode} isRequired autoFocus description={t("home.codeHelp", "Your game master can give you the code or a link.")} />
        <Button type="submit" variant="primary">
          {t("home.continue", "Continue")}
        </Button>
      </form>
    </ModalDialog>
  );
}

export function CharacterCard({ c }: { c: CharacterSummary }) {
  const { t } = useTranslation();
  return (
    <Card as="li" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold">
            <Link to="/characters/$id" params={{ id: c.id }} className="underline-offset-2 hover:underline">
              {c.name}
            </Link>
          </h3>
          <p className="text-sm text-muted">
            {c.species} · {c.className} {t("common.level", "level")} {c.level}
          </p>
        </div>
        <Badge>{t("common.ac", "AC")} {c.ac}</Badge>
      </div>
      <HpBar hp={c.hp} max={c.maxHp} label={t("common.hpOf", "Hit points of {{name}}", { name: c.name })} />
      <p className="text-sm">
        {t("common.hp", "HP")} {c.hp}/{c.maxHp}
        {c.campaignName && <span className="text-muted"> · {c.campaignName}</span>}
      </p>
    </Card>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<CampaignSummary[]>("/campaigns"), enabled: !!me });
  const characters = useQuery({ queryKey: ["characters"], queryFn: () => api.get<CharacterSummary[]>("/characters"), enabled: !!me });

  if (isLoading) return <Spinner />;
  if (!me) return <Landing />;

  const mine = characters.data?.filter((c) => c.ownerId === me.id) ?? [];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("home.welcome", "Welcome, {{name}}", { name: me.displayName })} subtitle={t("home.subtitle", "Your campaigns and your characters.")} />
      <section aria-labelledby="campaigns-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="campaigns-title" className="font-display text-2xl font-semibold">
            {t("home.campaigns", "Campaigns")}
          </h2>
          <div className="flex gap-2">
            <Button onPress={() => setJoinOpen(true)}>
              <UserPlus aria-hidden className="h-4 w-4" />
              {t("home.join", "Join with a code")}
            </Button>
            <Button variant="primary" onPress={() => setCreateOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" />
              {t("home.newCampaign", "New campaign")}
            </Button>
          </div>
        </div>
        {campaigns.isLoading ? (
          <Spinner />
        ) : campaigns.data?.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {campaigns.data.map((c) => (
              <Card as="li" key={c.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">
                    <Link to="/campaigns/$id" params={{ id: c.id }} search={{ tab: undefined }} className="underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                  </h3>
                  {c.role === "gm" ? (
                    <Badge tone="accent">
                      <Crown aria-hidden className="h-3 w-3" />
                      {t("roles.gm", "Game master")}
                    </Badge>
                  ) : (
                    <Badge tone="info">{t("roles.player", "Player")}</Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-muted">{c.description}</p>
                <p className="text-sm">
                  {t("home.gmBy", "GM: {{name}}", { name: c.gmName })} · {t("home.characterCount", "{{count}} characters", { count: c.characterCount })}
                </p>
                {c.role === "gm" && (
                  <Link to="/campaigns/$id/table" params={{ id: c.id }} className={buttonClass("accent", "sm") + " self-start"}>
                    <Swords aria-hidden className="h-4 w-4" />
                    {t("home.openTable", "Open the table")}
                  </Link>
                )}
              </Card>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("home.noCampaign", "No campaign yet")}>{t("home.noCampaignText", "Create one as a game master, or join your friends' campaign with its code.")}</EmptyState>
        )}
      </section>
      <section aria-labelledby="characters-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="characters-title" className="font-display text-2xl font-semibold">
            {t("home.characters", "My characters")}
          </h2>
          <Link to="/characters/new" className={buttonClass("primary")}>
            <Plus aria-hidden className="h-4 w-4" />
            {t("home.newCharacter", "New character")}
          </Link>
        </div>
        {characters.isLoading ? (
          <Spinner />
        ) : mine.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <CharacterCard key={c.id} c={c} />
            ))}
          </ul>
        ) : (
          <EmptyState title={t("home.noCharacter", "No character yet")}>{t("home.noCharacterText", "The builder guides you step by step.")}</EmptyState>
        )}
      </section>
      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
