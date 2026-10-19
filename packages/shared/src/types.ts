import type { Probabilities, RollResult } from "@tavernlight/dice";
import type {
  CharacterBuild,
  CharacterDetails,
  CharacterState,
  CombatState,
  DerivedCharacter,
  Effect,
  MapData,
  PlayerCombatView,
  PlayerMapView,
  Proposal,
  ValidationIssue,
} from "@tavernlight/engine";
import type { NoteKind, RollVisibility } from "./schemas";

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  user: UserDto;
  /** Bearer token for clients that don't use cookies (mobile app). */
  token: string;
}

export type CampaignRole = "gm" | "player";

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  role: CampaignRole;
  gmName: string;
  characterCount: number;
  updatedAt: string;
}

export interface CampaignMemberDto {
  userId: string;
  displayName: string;
  role: CampaignRole;
}

export interface CharacterSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  campaignName: string | null;
  species: string;
  className: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  portraitAssetId?: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  description: string;
  role: CampaignRole;
  inviteCode: string | null;
  members: CampaignMemberDto[];
  characters: CharacterSummary[];
  activeMapId: string | null;
}

export interface CharacterDto {
  id: string;
  ownerId: string;
  campaignId: string | null;
  build: CharacterBuild;
  state: CharacterState;
  details: CharacterDetails;
  derived: DerivedCharacter;
  issues: ValidationIssue[];
  updatedAt: string;
}

export interface RollDto {
  id: string;
  userId: string;
  userName: string;
  characterId: string | null;
  characterName: string | null;
  campaignId: string | null;
  label: string | null;
  expression: string;
  visibility: RollVisibility;
  result: RollResult;
  createdAt: string;
}

export interface ProbabilityDto extends Probabilities {
  expression: string;
}

export interface MapSummary {
  id: string;
  name: string;
  description: string;
  gridType: "square" | "hex";
  cols: number;
  rows: number;
  updatedAt: string;
}

export interface MapDto extends MapSummary {
  campaignId: string;
  data: MapData;
}

export interface EncounterDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  mapId: string | null;
  monsters: { key: string; count: number; name: string; cr: number; xp: number }[];
}

export interface NoteDto {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  status: string | null;
  updatedAt: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  body: string;
  assetId: string | null;
  revealed: boolean;
  updatedAt: string;
}

export interface LogEntryDto {
  id: string;
  seq: number;
  kind: string;
  title: string;
  lines: string[];
  undoable: boolean;
  undone: boolean;
  createdAt: string;
}

export interface MonsterSummary {
  key: string;
  name: string;
  type: string;
  size: string;
  cr: number;
  xp: number;
  ac: number;
  hp: number;
}

export interface SpellSummary {
  key: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  concentration: boolean;
  ritual: boolean;
}

// --- Real-time table ------------------------------------------------------------

export type TableView = "gm" | "players";

export interface TablePerf {
  /** Server time when the snapshot was built (ms since epoch). */
  sentAt: number;
  /** Time spent computing line of sight and filtering, in ms. */
  computeMs: number;
  version: number;
}

/** Everything the game master's screen shows. */
export interface GmTableState {
  view: "gm";
  campaignId: string;
  map: MapDto | null;
  /** Cells the party sees right now (for the GM's preview). */
  visible: number[];
  combat: (CombatState & { id: string }) | null;
  pending: Proposal[];
  log: LogEntryDto[];
  rolls: RollDto[];
  documents: DocumentDto[];
  revealedDocumentId: string | null;
  perf: TablePerf;
}

/** What the players' view receives: already filtered by the server. */
export interface PlayerTableState {
  view: "players";
  campaignId: string;
  campaignName: string;
  map: (PlayerMapView & { id: string; name: string }) | null;
  /** Bumped when the masked background image changes. */
  backgroundVersion: string | null;
  combat: PlayerCombatView | null;
  rolls: RollDto[];
  document: DocumentDto | null;
  party: { id: string; name: string; hp: number; maxHp: number; tempHp: number; ac: number; conditions: string[] }[];
  perf: TablePerf;
}

export type TableState = GmTableState | PlayerTableState;

/** Short message read by screen readers on both views. */
export interface TableAnnouncement {
  text: string;
  at: number;
}

export interface AreaRequest {
  shape: "sphere" | "cone" | "line" | "cube" | "cylinder" | "emanation";
  size: number;
  width?: number;
  origin: { x: number; y: number };
  target: { x: number; y: number };
}

/** Commands sent by the game master's view (socket.io, with acknowledgement). */
export interface TableCommands {
  "map:activate": { mapId: string | null };
  "token:move": { tokenId: string; col: number; row: number; force?: boolean };
  "token:update": { tokenId: string; patch: Partial<{ hidden: boolean; layer: "tokens" | "gm"; name: string; label: string; color: string; side: "party" | "enemy" | "neutral"; size: number; visionRange: number }> };
  "token:remove": { tokenId: string };
  "door:toggle": { wallId: string };
  "fog:reveal": { cells: number[]; reveal: boolean };
  "fog:settings": { mode?: "manual" | "auto"; enabled?: boolean };
  "combat:create": { includeTokens: boolean; encounterId?: string };
  "combat:addToken": { tokenId: string };
  "combat:remove": { combatantId: string };
  "combat:rollInitiative": { combatantIds?: string[] };
  "combat:setInitiative": { combatantId: string; value: number };
  "combat:start": Record<string, never>;
  "combat:next": Record<string, never>;
  "combat:end": Record<string, never>;
  "combat:resolve": { actorId: string; actionKey: string; targetIds: string[]; slotLevel?: number; advantage?: "advantage" | "disadvantage" | null };
  "combat:effect": { targetIds: string[]; effect: Effect; title?: string; sourceId?: string };
  "combat:deathSave": { combatantId: string };
  "combat:apply": { proposal: Proposal };
  "combat:discard": { proposalId: string };
  "combat:undo": { entryId: string };
  "combat:removeStatus": { combatantId: string; statusId: string };
  "combat:visibility": { combatantId: string; hidden: boolean };
  "area:targets": { area: AreaRequest; casterTokenId?: string };
  "doc:reveal": { documentId: string | null };
  roll: { expression: string; label?: string; visibility: RollVisibility; characterId?: string; advantage?: "advantage" | "disadvantage" | null };
}

export type CommandResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export interface ServerEvents {
  "table:state": TableState;
  "table:announce": TableAnnouncement;
  "table:error": { message: string };
}
