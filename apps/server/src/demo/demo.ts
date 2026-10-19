import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import {
  RulesIndex,
  derive,
  emptyState,
  initialState,
  isValid,
  validateBuild,
  type CharacterBuild,
  type MapData,
  type Token,
} from "@tavernlight/engine";
import { newInviteCode } from "../campaigns/campaigns.service";
import { loadActiveRules } from "../srd/load";
import { EncountersService } from "../encounters/encounters.controller";
import { caveMap, cryptMap, forestMap } from "./maps";

export const DEMO_CAMPAIGN_NAME = "The Lantern of Hollowmere";

export const DEMO_USERS = [
  { email: "gm@tavernlight.test", displayName: "Morgan (GM)" },
  { email: "alex@tavernlight.test", displayName: "Alex" },
  { email: "sam@tavernlight.test", displayName: "Sam" },
  { email: "robin@tavernlight.test", displayName: "Robin" },
  { email: "charlie@tavernlight.test", displayName: "Charlie" },
];

/** Four characters of different classes and levels (1 to 5). */
export const DEMO_BUILDS: CharacterBuild[] = [
  {
    name: "Thorin Ashvale",
    species: "dwarf",
    background: "soldier",
    class: "fighter",
    subclass: "champion",
    level: 5,
    abilityMethod: "standardArray",
    baseAbilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    backgroundBoost: { str: 2, con: 1 },
    classSkills: ["perception", "survival"],
    choices: { "class:fighter:fighter-fighting-style:style": ["defense"] },
    equipment: { class: "a", background: "a" },
    cantrips: [],
    preparedSpells: [],
    levels: [
      { level: 2, hp: { method: "average", value: 6 } },
      { level: 3, hp: { method: "average", value: 6 } },
      { level: 4, hp: { method: "average", value: 6 }, asi: { type: "asi", increases: { str: 1, con: 1 } } },
      { level: 5, hp: { method: "average", value: 6 } },
    ],
  },
  {
    name: "Lyra Vennis",
    species: "elf",
    lineage: "elven-lineage-high-elf",
    background: "sage",
    class: "wizard",
    subclass: "evoker",
    level: 3,
    abilityMethod: "pointBuy",
    baseAbilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 },
    backgroundBoost: { int: 2, con: 1 },
    classSkills: ["insight", "investigation"],
    choices: {
      "species:elf:keen-senses:skill": ["perception"],
      "background:sage:feat:cantrips": ["light", "mage-hand"],
      "background:sage:feat:spell": ["sleep"],
    },
    equipment: { class: "a", background: "a" },
    cantrips: ["fire-bolt", "ray-of-frost", "shocking-grasp"],
    preparedSpells: ["magic-missile", "shield", "burning-hands", "mage-armor", "scorching-ray", "misty-step"],
    levels: [
      { level: 2, hp: { method: "average", value: 4 } },
      { level: 3, hp: { method: "average", value: 4 } },
    ],
  },
  {
    name: "Mira Dunhollow",
    species: "human",
    size: "medium",
    background: "acolyte",
    class: "cleric",
    subclass: "life-domain",
    level: 4,
    abilityMethod: "standardArray",
    baseAbilities: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 },
    backgroundBoost: { wis: 2, cha: 1 },
    classSkills: ["medicine", "persuasion"],
    choices: {
      "species:human:skillful:skill": ["perception"],
      "species:human:versatile:feat": ["alert"],
      "class:cleric:cleric-divine-order:order": ["protector"],
      "background:acolyte:feat:cantrips": ["spare-the-dying", "resistance"],
      "background:acolyte:feat:spell": ["command"],
    },
    equipment: { class: "a", background: "a" },
    cantrips: ["sacred-flame", "guidance", "thaumaturgy", "light"],
    preparedSpells: ["bless", "cure-wounds", "healing-word", "shield-of-faith", "guiding-bolt", "spiritual-weapon", "hold-person"],
    levels: [
      { level: 2, hp: { method: "average", value: 5 } },
      { level: 3, hp: { method: "average", value: 5 } },
      { level: 4, hp: { method: "average", value: 5 }, asi: { type: "asi", increases: { wis: 1, con: 1 } } },
    ],
  },
  {
    name: "Pip Underbough",
    species: "halfling",
    background: "criminal",
    class: "rogue",
    level: 1,
    abilityMethod: "standardArray",
    baseAbilities: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 13 },
    backgroundBoost: { dex: 2, con: 1 },
    classSkills: ["acrobatics", "deception", "perception", "investigation"],
    choices: { "class:rogue:rogue-expertise:expertise": ["stealth", "perception"] },
    equipment: { class: "a", background: "a" },
    cantrips: [],
    preparedSpells: [],
    levels: [],
  },
];

const PARTY_COLORS = ["#1f6feb", "#8250df", "#1a7f37", "#bf8700"];

/**
 * Creates the demo campaign (idempotent: does nothing if it already exists).
 * Demo password: DEMO_PASSWORD (default "tavernlight").
 */
export async function seedDemo(prisma: PrismaClient): Promise<{ created: boolean; campaignId: string }> {
  const existing = await prisma.campaign.findFirst({ where: { name: DEMO_CAMPAIGN_NAME } });
  if (existing) return { created: false, campaignId: existing.id };

  const loaded = await loadActiveRules(prisma);
  if (!loaded) throw new Error('Import the rules first ("pnpm srd:import").');
  const rules = new RulesIndex(loaded.data);

  const password = process.env.DEMO_PASSWORD ?? "tavernlight";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const users = [];
  for (const u of DEMO_USERS) {
    users.push(await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } }));
  }
  const [gm, ...players] = users;

  const campaign = await prisma.campaign.create({
    data: {
      name: DEMO_CAMPAIGN_NAME,
      description:
        "A lantern that never goes out has been stolen from the shrine of Hollowmere. The trail leads through the Briarwood road, a goblin cave and the old crypt under the hill.",
      inviteCode: newInviteCode(),
      members: { create: [{ userId: gm.id, role: "gm" }, ...players.map((p) => ({ userId: p.id, role: "player" }))] },
    },
  });

  const characters: { character: { id: string; name: string }; derived: ReturnType<typeof derive> }[] = [];
  for (let i = 0; i < DEMO_BUILDS.length; i++) {
    const build = DEMO_BUILDS[i];
    const issues = validateBuild(build, rules).filter((x) => x.severity === "error");
    if (!isValid(issues)) throw new Error(`Demo character ${build.name} is invalid: ${issues.map((x) => x.message).join("; ")}`);
    const state = initialState(build, rules, emptyState());
    const character = await prisma.character.create({
      data: { ownerId: players[i].id, campaignId: campaign.id, name: build.name, build: build as object, state: state as object, details: { alignment: "Neutral Good" } },
    });
    characters.push({ character, derived: derive(build, state, rules) });
  }

  const partyTokens = (start: { col: number; row: number }[]): Token[] =>
    characters.map(({ character, derived }, i) => ({
      id: `tok_pc_${i}`,
      name: character.name.split(" ")[0],
      kind: "pc",
      side: "party",
      col: start[i].col,
      row: start[i].row,
      size: 1,
      layer: "tokens",
      hidden: false,
      label: character.name[0],
      color: PARTY_COLORS[i],
      characterId: character.id,
      visionRange: 0,
    }));

  const encounters = new EncountersService(prisma as never, { rules } as never);
  const definitions: { name: string; description: string; data: MapData; start: { col: number; row: number }[]; encounter: { name: string; monsters: { key: string; count: number }[]; at: { col: number; row: number }; hidden?: boolean } }[] = [
    {
      name: "Crypt under the hill",
      description: "Entrance hall, a narrow corridor and the burial chamber. A secret door hides a small vault.",
      data: cryptMap(),
      start: [
        { col: 3, row: 9 },
        { col: 3, row: 11 },
        { col: 4, row: 10 },
        { col: 2, row: 10 },
      ],
      encounter: { name: "The restless dead", monsters: [{ key: "skeleton", count: 3 }, { key: "zombie", count: 1 }], at: { col: 23, row: 10 } },
    },
    {
      name: "Briarwood road",
      description: "A forest road on a hex grid. Goblins wait in ambush behind the trees.",
      data: forestMap(),
      start: [
        { col: 1, row: 7 },
        { col: 1, row: 8 },
        { col: 2, row: 7 },
        { col: 2, row: 8 },
      ],
      encounter: { name: "Goblin ambush", monsters: [{ key: "goblin-warrior", count: 4 }, { key: "goblin-boss", count: 1 }], at: { col: 18, row: 8 } },
    },
    {
      name: "Ogre's den",
      description: "A cave with an underground pool. The ogre sleeps near its hoard.",
      data: caveMap(),
      start: [
        { col: 2, row: 8 },
        { col: 2, row: 9 },
        { col: 3, row: 8 },
        { col: 3, row: 9 },
      ],
      encounter: { name: "The ogre's lair", monsters: [{ key: "ogre", count: 1 }, { key: "goblin-warrior", count: 2 }], at: { col: 18, row: 6 } },
    },
  ];

  let firstMapId: string | null = null;
  for (const def of definitions) {
    const encounter = await prisma.encounter.create({
      data: { campaignId: campaign.id, name: def.encounter.name, description: "", monsters: def.encounter.monsters },
    });
    let data: MapData = { ...def.data, tokens: [...def.data.tokens, ...partyTokens(def.start)] };
    data = encounters.place(data, encounters.toDto(encounter), def.encounter.at, false);
    const map = await prisma.gameMap.create({
      data: { campaignId: campaign.id, name: def.name, description: def.description, gridType: data.grid.type, cols: data.grid.cols, rows: data.grid.rows, data: data as object },
    });
    await prisma.encounter.update({ where: { id: encounter.id }, data: { mapId: map.id } });
    firstMapId ??= map.id;
  }
  // One creature of the crypt lies in wait on the GM layer.
  const crypt = await prisma.gameMap.findUniqueOrThrow({ where: { id: firstMapId! } });
  const cryptData = crypt.data as unknown as MapData;
  const zombie = cryptData.tokens.find((t) => t.monsterKey === "zombie");
  if (zombie) {
    zombie.hidden = true;
    zombie.layer = "gm";
    await prisma.gameMap.update({ where: { id: crypt.id }, data: { data: cryptData as object } });
  }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { activeMapId: firstMapId } });

  await prisma.note.createMany({
    data: [
      { campaignId: campaign.id, kind: "npc", title: "Sister Elowen", body: "Keeper of the Hollowmere shrine. Kind, worried, hides that she let the thief in.", status: "Ally" },
      { campaignId: campaign.id, kind: "npc", title: "Grak the Toothless", body: "Goblin boss of the Briarwood band. Cowardly; will bargain if reduced below half HP.", status: "Enemy" },
      { campaignId: campaign.id, kind: "place", title: "Hollowmere shrine", body: "Small stone chapel at the edge of the lake. The empty lantern hook still smells of oil." },
      { campaignId: campaign.id, kind: "place", title: "The crypt under the hill", body: "Old burial site. The sarcophagus hides the stolen lantern; the secret door (south wall) opens with a DC 15 Investigation check." },
      { campaignId: campaign.id, kind: "quest", title: "Bring back the Everlit Lantern", body: "Reward: 100 GP and the shrine's blessing.", status: "Active" },
      { campaignId: campaign.id, kind: "note", title: "Session plan", body: "1. Ambush on the road. 2. Follow the tracks to the ogre's den. 3. The crypt." },
    ],
  });
  await prisma.campaignDocument.createMany({
    data: [
      { campaignId: campaign.id, title: "A torn letter", body: "\"...the lantern must never reach the crypt. If the dead wake, the light is all that holds them. — E.\"" },
      { campaignId: campaign.id, title: "Goblin map scrawl", body: "A crude drawing: a road, three trees, an arrow pointing to a cave marked with a skull and a smiling ogre." },
      { campaignId: campaign.id, title: "Inscription on the sarcophagus", body: "HERE SLEEPS THE WARDEN. LET THE LIGHT KEEP HER." },
    ],
  });
  return { created: true, campaignId: campaign.id };
}
