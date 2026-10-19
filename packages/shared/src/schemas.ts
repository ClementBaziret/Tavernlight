import { z } from "zod";

/*
 * Request bodies accepted by the API. The server validates every request
 * with these schemas; the clients use them to type their calls.
 */

const ability = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const abilityScores = z.object({ str: z.number().int(), dex: z.number().int(), con: z.number().int(), int: z.number().int(), wis: z.number().int(), cha: z.number().int() });
const key = z.string().min(1).max(100);

// --- Auth -------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.email().max(200),
  displayName: z.string().trim().min(2).max(40),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Campaigns --------------------------------------------------------------

export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(4000).default(""),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export const joinCampaignSchema = z.object({
  code: z.string().trim().min(4).max(20),
  characterId: z.string().optional(),
});

export const attachCharacterSchema = z.object({ characterId: z.string() });

// --- Characters --------------------------------------------------------------

const levelUpRecord = z.object({
  level: z.number().int().min(2).max(20),
  hp: z.object({ method: z.enum(["average", "roll"]), value: z.number().int() }),
  asi: z
    .union([
      z.object({ type: z.literal("asi"), increases: z.partialRecord(ability, z.number().int()) }),
      z.object({ type: z.literal("feat"), feat: key }),
    ])
    .optional(),
});

export const characterBuildSchema = z.object({
  name: z.string().trim().min(1).max(60),
  species: key,
  lineage: key.optional(),
  size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional(),
  background: key,
  class: key,
  subclass: key.optional(),
  level: z.number().int().min(1).max(20),
  abilityMethod: z.enum(["pointBuy", "standardArray", "rolled"]),
  baseAbilities: abilityScores,
  rolledScores: z.array(z.number().int()).optional(),
  backgroundBoost: z.partialRecord(ability, z.number().int()),
  classSkills: z.array(key).max(10),
  choices: z.record(z.string().max(200), z.array(key).max(20)),
  equipment: z.object({ class: key.optional(), background: key.optional() }),
  cantrips: z.array(key).max(20),
  preparedSpells: z.array(key).max(40),
  levels: z.array(levelUpRecord).max(19),
});

export const characterDetailsSchema = z.object({
  alignment: z.string().max(40).optional(),
  appearance: z.string().max(2000).optional(),
  personality: z.string().max(2000).optional(),
  backstory: z.string().max(8000).optional(),
  portraitAssetId: z.string().optional(),
});

export const createCharacterSchema = z.object({
  build: characterBuildSchema,
  details: characterDetailsSchema.default({}),
  /** Token returned by POST /characters/roll-abilities when the method is "rolled". */
  rollToken: z.string().optional(),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

export const updateCharacterSchema = z.object({
  build: characterBuildSchema.optional(),
  details: characterDetailsSchema.optional(),
});

const inventoryItem = z.object({
  id: z.string().max(80),
  item: key.nullable(),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(0).max(100000),
  weight: z.number().min(0).max(10000),
  equipped: z.boolean(),
  notes: z.string().max(500).optional(),
});

/** Play-state changes made from the sheet (web and mobile). */
export const characterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("damage"), amount: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal("heal"), amount: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal("tempHp"), amount: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal("shortRest"), hitDice: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal("longRest") }),
  z.object({ type: z.literal("slot"), level: z.number().int().min(1).max(9), delta: z.number().int().min(-9).max(9) }),
  z.object({ type: z.literal("resource"), key, delta: z.number().int().min(-20).max(20) }),
  z.object({ type: z.literal("deathSave"), success: z.boolean() }),
  z.object({ type: z.literal("conditions"), conditions: z.array(key).max(20), exhaustion: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("inventory"), inventory: z.array(inventoryItem).max(300) }),
  z.object({ type: z.literal("currency"), currency: z.object({ cp: z.number().int().min(0), sp: z.number().int().min(0), ep: z.number().int().min(0), gp: z.number().int().min(0), pp: z.number().int().min(0) }) }),
  z.object({ type: z.literal("notes"), notes: z.string().max(20000) }),
  z.object({ type: z.literal("inspiration"), value: z.boolean() }),
]);
export type CharacterAction = z.infer<typeof characterActionSchema>;

export const levelUpSchema = z.object({
  hp: z.object({ method: z.enum(["average", "roll"]) }),
  subclass: key.optional(),
  asi: levelUpRecord.shape.asi,
  choices: z.record(z.string().max(200), z.array(key).max(20)).optional(),
  cantrips: z.array(key).max(20).optional(),
  preparedSpells: z.array(key).max(40).optional(),
});
export type LevelUpRequest = z.infer<typeof levelUpSchema>;

// --- Dice ---------------------------------------------------------------------

export const rollVisibility = z.enum(["public", "private", "hidden"]);
export type RollVisibility = z.infer<typeof rollVisibility>;

export const rollSchema = z.object({
  expression: z.string().trim().min(1).max(500),
  label: z.string().max(120).optional(),
  visibility: rollVisibility.default("public"),
  advantage: z.enum(["advantage", "disadvantage"]).nullable().optional(),
  campaignId: z.string().optional(),
  characterId: z.string().optional(),
});
export type RollInput = z.infer<typeof rollSchema>;

export const probabilitySchema = z.object({
  expression: z.string().trim().min(1).max(500),
  advantage: z.enum(["advantage", "disadvantage"]).nullable().optional(),
});

// --- Maps ---------------------------------------------------------------------

const point = z.object({ x: z.number(), y: z.number() });

export const mapDataSchema = z.object({
  grid: z.object({
    type: z.enum(["square", "hex"]),
    cols: z.number().int().min(2).max(120),
    rows: z.number().int().min(2).max(120),
    cellSize: z.number().min(16).max(256),
    feetPerCell: z.number().min(1).max(100),
    diagonals: z.enum(["standard", "alternate"]),
  }),
  background: z.object({ assetId: z.string(), opacity: z.number().min(0).max(1) }).nullable().optional(),
  terrain: z.array(z.string().max(40).nullable()).max(14400),
  decor: z
    .array(
      z.object({
        id: z.string().max(80),
        icon: z.string().max(40),
        x: z.number(),
        y: z.number(),
        size: z.number().min(0.25).max(20),
        rotation: z.number(),
        layer: z.enum(["decor", "gm"]),
        label: z.string().max(80).optional(),
        blocksSight: z.boolean().optional(),
      }),
    )
    .max(2000),
  walls: z
    .array(
      z.object({
        id: z.string().max(80),
        a: point,
        b: point,
        kind: z.enum(["wall", "door", "window"]),
        open: z.boolean().optional(),
        secret: z.boolean().optional(),
      }),
    )
    .max(5000),
  tokens: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().max(80),
        kind: z.enum(["pc", "npc", "monster", "object"]),
        side: z.enum(["party", "enemy", "neutral"]),
        col: z.number().int(),
        row: z.number().int(),
        size: z.number().int().min(1).max(8),
        layer: z.enum(["tokens", "gm"]),
        hidden: z.boolean(),
        label: z.string().max(3),
        color: z.string().max(20),
        characterId: z.string().optional(),
        monsterKey: z.string().optional(),
        visionRange: z.number().min(0).optional(),
      }),
    )
    .max(500),
  fog: z.object({ mode: z.enum(["manual", "auto"]), revealed: z.array(z.number().int().min(0)).max(14400), enabled: z.boolean() }),
});

export const mapSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(4000).default(""),
  data: mapDataSchema,
});
export type MapInput = z.infer<typeof mapSchema>;

// --- Encounters ---------------------------------------------------------------

export const encounterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(4000).default(""),
  mapId: z.string().nullable().optional(),
  monsters: z.array(z.object({ key, count: z.number().int().min(1).max(50) })).max(30),
});
export type EncounterInput = z.infer<typeof encounterSchema>;

export const placeEncounterSchema = z.object({
  mapId: z.string(),
  /** Top-left cell of the placement area; defaults to a free area of the map. */
  col: z.number().int().optional(),
  row: z.number().int().optional(),
  hidden: z.boolean().default(false),
});

// --- Campaign content ------------------------------------------------------------

export const noteKinds = z.enum(["note", "npc", "place", "quest"]);
export type NoteKind = z.infer<typeof noteKinds>;

export const noteSchema = z.object({
  kind: noteKinds,
  title: z.string().trim().min(1).max(120),
  body: z.string().max(20000).default(""),
  status: z.string().max(40).optional(),
});

export const documentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(20000).default(""),
  assetId: z.string().nullable().optional(),
});
