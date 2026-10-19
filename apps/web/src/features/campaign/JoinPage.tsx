import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CampaignDetail, CharacterSummary } from "@tavernlight/shared";
import { Alert, Button, Card, PageHeader, RadioGroup, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";

export function JoinPage() {
  const { t } = useTranslation();
  const { code } = useParams({ strict: false }) as { code: string };
  const navigate = useNavigate();
  const { data: me } = useMe();
  const characters = useQuery({ queryKey: ["characters"], queryFn: () => api.get<CharacterSummary[]>("/characters") });
  const free = characters.data?.filter((c) => c.ownerId === me?.id && !c.campaignId) ?? [];
  const [characterId, setCharacterId] = useState("none");
  const join = useMutation({
    mutationFn: () => api.post<CampaignDetail>("/campaigns/join", { code, characterId: characterId === "none" ? undefined : characterId }),
    onSuccess: (c) => void navigate({ to: "/campaigns/$id", params: { id: c.id }, search: { tab: undefined } }),
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("join.title", "Join a campaign")} subtitle={t("join.code", "Invitation code: {{code}}", { code })} />
      <Card className="flex flex-col gap-4">
        {join.error && <Alert tone="danger">{errorMessage(join.error)}</Alert>}
        {characters.isLoading ? (
          <Spinner />
        ) : (
          <RadioGroup
            label={t("join.which", "Which character will play?")}
            value={characterId}
            onChange={setCharacterId}
            options={[
              { id: "none", label: t("join.later", "Choose later"), description: t("join.laterHelp", "You can add a character from the campaign page.") },
              ...free.map((c) => ({ id: c.id, label: c.name, description: `${c.species} · ${c.className} ${c.level}` })),
            ]}
          />
        )}
        <p className="text-sm text-muted">
          {t("join.noCharacter", "No character yet?")}{" "}
          <Link to="/characters/new" className="font-semibold text-accent underline">
            {t("home.newCharacter", "New character")}
          </Link>
        </p>
        <Button variant="primary" onPress={() => join.mutate()} loading={join.isPending}>
          {t("join.submit", "Join")}
        </Button>
      </Card>
    </div>
  );
}
