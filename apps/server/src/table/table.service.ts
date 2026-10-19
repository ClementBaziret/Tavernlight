import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Character, Combat, GameMap, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { Server } from "socket.io";
import {
  applyOps,
  applyProposal,
  characterStateFromCombatant,
  combatantFromCharacter,
  combatantFromMonster,
  computeFog,
  deathSaveProposal,
  derive,
  emptyCombat,
  endCombat,
  getCombatant,
  invertOps,
  manualEffectProposal,
  moveBlocked,
  newId,
  nextTurn,
  placeArea,
  playerCombatView,
  playerMapView,
  removeStatusOps,
  resolveAction,
  revealCells,
  rollInitiative,
  setInitiative,
  sortOrder,
  startCombat,
  tokensInArea,
  tokenVisibleToPlayers,
  cellLabel,
  type CharacterBuild,
  type CharacterState,
  type Combatant,
  type CombatState,
  type MapData,
  type Op,
  type Proposal,
  type Token,
} from "@tavernlight/engine";
import type { GmTableState, LogEntryDto, PlayerTableState, RollDto, TableCommands } from "@tavernlight/shared";
import { secureRoller } from "../common/rng";
import { CharactersService } from "../characters/characters.service";
import { DiceService } from "../dice/dice.service";
import { toMapDto } from "../common/dto";
import { toDocumentDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { RulesService } from "../rules/rules.service";

export const gmRoom = (campaignId: string) => `${campaignId}:gm`;
export const playersRoom = (campaignId: string) => `${campaignId}:players`;

type CombatWithState = Omit<Combat, "state" | "pending"> & { state: CombatState; pending: Proposal[] };

/**
 * The real-time table: active map, fog of war, combat and game log of a
 * campaign. Every change goes through here; after each change a snapshot
 * is computed for the game master and a filtered one for the players' view.
 */
@Injectable()
export class TableService implements OnModuleInit {
  private readonly logger = new Logger(TableService.name);
  private server: Server | null = null;
  private versions = new Map<string, number>();
  /** Serializes commands per campaign so concurrent edits can't interleave. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly characters: CharactersService,
    private readonly dice: DiceService,
  ) {}

  onModuleInit() {
    this.characters.onChange((c) => this.onCharacterChanged(c));
    this.dice.onRoll((roll) => this.onRoll(roll));
  }

  attachServer(server: Server) {
    this.server = server;
  }

  /** Runs `fn` after the previous command of the same campaign. */
  exclusive<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(campaignId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    this.queues.set(
      campaignId,
      next.catch(() => undefined),
    );
    return next;
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private async activeMap(campaignId: string): Promise<GameMap | null> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { activeMapId: true } });
    if (!campaign?.activeMapId) return null;
    return this.prisma.gameMap.findUnique({ where: { id: campaign.activeMapId } });
  }

  private async activeCombat(campaignId: string): Promise<CombatWithState | null> {
    const combat = await this.prisma.combat.findFirst({ where: { campaignId, active: true }, orderBy: { createdAt: "desc" } });
    if (!combat) return null;
    return { ...combat, state: combat.state as unknown as CombatState, pending: (combat.pending as unknown as Proposal[]) ?? [] };
  }

  private async requireMap(campaignId: string): Promise<GameMap & { mapData: MapData }> {
    const map = await this.activeMap(campaignId);
    if (!map) throw new BadRequestException("No map is displayed on the table.");
    return { ...map, mapData: map.data as unknown as MapData };
  }

  private async requireCombat(campaignId: string): Promise<CombatWithState> {
    const combat = await this.activeCombat(campaignId);
    if (!combat) throw new BadRequestException("No combat in progress.");
    return combat;
  }

  private async saveMap(mapId: string, data: MapData) {
    await this.prisma.gameMap.update({ where: { id: mapId }, data: { data: data as object } });
  }

  private async saveCombat(id: string, state: CombatState, pending: Proposal[]) {
    await this.prisma.combat.update({ where: { id }, data: { state: state as object, pending: pending as unknown as Prisma.InputJsonValue } });
  }

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  private nextVersion(campaignId: string) {
    const v = (this.versions.get(campaignId) ?? 0) + 1;
    this.versions.set(campaignId, v);
    return v;
  }

  private async logEntries(campaignId: string): Promise<LogEntryDto[]> {
    const entries = await this.prisma.logEntry.findMany({ where: { campaignId }, orderBy: { seq: "desc" }, take: 60 });
    return entries.map((e) => ({
      id: e.id,
      seq: e.seq,
      kind: e.kind,
      title: e.title,
      lines: e.lines as string[],
      undoable: !!e.ops && !e.undone,
      undone: e.undone,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async gmState(campaignId: string): Promise<GmTableState> {
    const started = performance.now();
    const [campaign, map, combat, rolls, documents, log] = await Promise.all([
      this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
      this.activeMap(campaignId),
      this.activeCombat(campaignId),
      this.dice.campaignRolls(campaignId, 30),
      this.prisma.campaignDocument.findMany({ where: { campaignId }, orderBy: { title: "asc" } }),
      this.logEntries(campaignId),
    ]);
    const visible = map ? [...computeFog(map.data as unknown as MapData).visible] : [];
    return {
      view: "gm",
      campaignId,
      map: map ? toMapDto(map) : null,
      visible,
      combat: combat ? { ...combat.state, id: combat.id } : null,
      pending: combat?.pending ?? [],
      log,
      rolls,
      documents: documents.map((d) => toDocumentDto(d, campaign.revealedDocumentId)),
      revealedDocumentId: campaign.revealedDocumentId,
      perf: { sentAt: Date.now(), computeMs: performance.now() - started, version: this.versions.get(campaignId) ?? 0 },
    };
  }

  /**
   * The players' view. Everything hidden is removed here, so it never
   * reaches the browser: unrevealed areas, the GM layer, hidden tokens and
   * combatants, hidden and private rolls, unrevealed documents, notes.
   */
  async playerState(campaignId: string): Promise<PlayerTableState> {
    const started = performance.now();
    const [campaign, map, combat, rolls, characters] = await Promise.all([
      this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
      this.activeMap(campaignId),
      this.activeCombat(campaignId),
      this.dice.campaignRolls(campaignId, 40),
      this.prisma.character.findMany({ where: { campaignId }, orderBy: { name: "asc" } }),
    ]);
    let mapView: PlayerTableState["map"] = null;
    let backgroundVersion: string | null = null;
    const visibleTokens = new Set<string>();
    if (map) {
      const data = map.data as unknown as MapData;
      const fog = computeFog(data);
      const view = playerMapView(data, fog);
      for (const t of view.tokens) visibleTokens.add(t.id);
      mapView = { ...view, id: map.id, name: map.name };
      if (data.background) {
        backgroundVersion = createHash("sha1").update(`${map.id}:${data.background.assetId}:${data.fog.enabled}:${(view.revealed ?? []).join(",")}`).digest("hex").slice(0, 16);
      }
    }
    const doc = campaign.revealedDocumentId ? await this.prisma.campaignDocument.findUnique({ where: { id: campaign.revealedDocumentId } }) : null;
    const rules = this.rules.rules;
    return {
      view: "players",
      campaignId,
      campaignName: campaign.name,
      map: mapView,
      backgroundVersion,
      combat: combat ? playerCombatView(combat.state, visibleTokens) : null,
      rolls: rolls.filter((r) => r.visibility === "public").slice(0, 15),
      document: doc ? toDocumentDto(doc, doc.id) : null,
      party: characters.map((c) => {
        const d = derive(c.build as unknown as CharacterBuild, c.state as unknown as CharacterState, rules);
        const st = c.state as unknown as CharacterState;
        return { id: c.id, name: c.name, hp: d.currentHp, maxHp: d.maxHp, tempHp: st.tempHp, ac: d.ac, conditions: st.conditions };
      }),
      perf: { sentAt: Date.now(), computeMs: performance.now() - started, version: this.versions.get(campaignId) ?? 0 },
    };
  }

  /** Sends fresh snapshots to both views of the campaign. */
  async broadcast(campaignId: string) {
    if (!this.server) return;
    this.nextVersion(campaignId);
    const gmSockets = await this.server.in(gmRoom(campaignId)).fetchSockets();
    const playerSockets = await this.server.in(playersRoom(campaignId)).fetchSockets();
    if (gmSockets.length) this.server.to(gmRoom(campaignId)).emit("table:state", await this.gmState(campaignId));
    if (playerSockets.length) {
      const state = await this.playerState(campaignId);
      this.server.to(playersRoom(campaignId)).emit("table:state", state);
      if (state.perf.computeMs > 50) this.logger.warn(`Players' view of ${campaignId} took ${state.perf.computeMs.toFixed(1)} ms`);
    }
  }

  announce(campaignId: string, text: string, audience: "all" | "gm" = "all") {
    if (!this.server) return;
    const payload = { text, at: Date.now() };
    this.server.to(gmRoom(campaignId)).emit("table:announce", payload);
    if (audience === "all") this.server.to(playersRoom(campaignId)).emit("table:announce", payload);
  }

  // ---------------------------------------------------------------------------
  // Game log
  // ---------------------------------------------------------------------------

  private async log(campaignId: string, kind: string, title: string, lines: string[], ops: Op[] | null, combatId?: string) {
    const last = await this.prisma.logEntry.findFirst({ where: { campaignId }, orderBy: { seq: "desc" }, select: { seq: true } });
    await this.prisma.logEntry.create({
      data: { campaignId, combatId, seq: (last?.seq ?? 0) + 1, kind, title, lines, ops: ops ? (ops as unknown as Prisma.InputJsonValue) : undefined },
    });
  }

  // ---------------------------------------------------------------------------
  // Sync with character sheets and dice
  // ---------------------------------------------------------------------------

  /** Writes the party's combat results back into their character sheets. */
  private async syncCharacters(state: CombatState, ids?: Set<string>) {
    for (const c of state.combatants) {
      if (c.kind !== "pc" || !c.characterId || (ids && !ids.has(c.id))) continue;
      const character = await this.prisma.character.findUnique({ where: { id: c.characterId } });
      if (!character) continue;
      const build = character.build as unknown as CharacterBuild;
      const st = character.state as unknown as CharacterState;
      const d = derive(build, st, this.rules.rules);
      await this.characters.saveState(character.id, characterStateFromCombatant(st, c, d.maxHp));
    }
  }

  /** A sheet changed (web or mobile): refresh its combatant and the views. */
  private async onCharacterChanged(character: Character) {
    if (!character.campaignId) return;
    const campaignId = character.campaignId;
    await this.exclusive(campaignId, async () => {
      const combat = await this.activeCombat(campaignId);
      if (combat) {
        const c = combat.state.combatants.find((x) => x.characterId === character.id);
        if (c) {
          const build = character.build as unknown as CharacterBuild;
          const st = character.state as unknown as CharacterState;
          const d = derive(build, st, this.rules.rules);
          c.hp = d.currentHp;
          c.maxHp = d.maxHp;
          c.tempHp = st.tempHp;
          c.ac = d.ac;
          c.deathSaves = { ...st.deathSaves };
          if (c.slots && d.spellcasting) c.slots = { max: [...d.spellcasting.slots], used: [...st.slotsUsed] };
          await this.saveCombat(combat.id, combat.state, combat.pending);
        }
      }
    });
    await this.broadcast(campaignId);
  }

  private async onRoll(roll: RollDto) {
    if (!roll.campaignId) return;
    await this.broadcast(roll.campaignId);
    const who = roll.characterName ?? roll.userName;
    const text = `${who}${roll.label ? ` — ${roll.label}` : ""}: ${roll.result.total}`;
    this.announce(roll.campaignId, text, roll.visibility === "public" ? "all" : "gm");
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  async mapChanged(campaignId: string, mapId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { activeMapId: true } });
    if (campaign?.activeMapId === mapId) await this.refreshFog(campaignId);
    await this.broadcast(campaignId);
  }

  /** In automatic mode, what the party sees becomes revealed. */
  private async refreshFog(campaignId: string) {
    const map = await this.activeMap(campaignId);
    if (!map) return;
    const data = map.data as unknown as MapData;
    if (data.fog.mode !== "auto") return;
    const { revealed } = computeFog(data);
    if (revealed.size !== data.fog.revealed.length) {
      await this.saveMap(map.id, { ...data, fog: { ...data.fog, revealed: [...revealed].sort((a, b) => a - b) } });
    }
  }

  async execute<K extends keyof TableCommands>(campaignId: string, userId: string, name: K, payload: TableCommands[K]): Promise<unknown> {
    const result = await this.exclusive(campaignId, () => this.run(campaignId, userId, name, payload));
    await this.broadcast(campaignId);
    return result;
  }

  private async run<K extends keyof TableCommands>(campaignId: string, userId: string, name: K, raw: TableCommands[K]): Promise<unknown> {
    // Payloads come from the network: each branch reads only what it needs.
    const p = raw as never as Record<string, unknown> & TableCommands[keyof TableCommands];
    switch (name) {
      case "map:activate": {
        const { mapId } = raw as TableCommands["map:activate"];
        if (mapId) {
          const exists = await this.prisma.gameMap.count({ where: { id: mapId, campaignId } });
          if (!exists) throw new NotFoundException("Map not found.");
        }
        await this.prisma.campaign.update({ where: { id: campaignId }, data: { activeMapId: mapId } });
        await this.refreshFog(campaignId);
        return null;
      }
      case "token:move":
        return this.moveToken(campaignId, raw as TableCommands["token:move"]);
      case "token:update": {
        const { tokenId, patch } = raw as TableCommands["token:update"];
        const map = await this.requireMap(campaignId);
        const tokens = map.mapData.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t));
        await this.saveMap(map.id, { ...map.mapData, tokens });
        if (patch.hidden !== undefined) {
          const combat = await this.activeCombat(campaignId);
          const c = combat?.state.combatants.find((x) => x.tokenId === tokenId);
          if (combat && c) {
            c.hidden = patch.hidden;
            await this.saveCombat(combat.id, combat.state, combat.pending);
          }
        }
        await this.refreshFog(campaignId);
        return null;
      }
      case "token:remove": {
        const { tokenId } = raw as TableCommands["token:remove"];
        const map = await this.requireMap(campaignId);
        await this.saveMap(map.id, { ...map.mapData, tokens: map.mapData.tokens.filter((t) => t.id !== tokenId) });
        return null;
      }
      case "door:toggle": {
        const { wallId } = raw as TableCommands["door:toggle"];
        const map = await this.requireMap(campaignId);
        const wall = map.mapData.walls.find((w) => w.id === wallId);
        if (!wall || wall.kind !== "door") throw new BadRequestException("This is not a door.");
        const walls = map.mapData.walls.map((w) => (w.id === wallId ? { ...w, open: !w.open } : w));
        await this.saveMap(map.id, { ...map.mapData, walls });
        await this.refreshFog(campaignId);
        this.announce(campaignId, wall.open ? "A door closes." : "A door opens.");
        return null;
      }
      case "fog:reveal": {
        const { cells, reveal } = raw as TableCommands["fog:reveal"];
        const map = await this.requireMap(campaignId);
        const max = map.mapData.grid.cols * map.mapData.grid.rows;
        const revealed = revealCells(map.mapData, cells.filter((c) => Number.isInteger(c) && c >= 0 && c < max), reveal);
        await this.saveMap(map.id, { ...map.mapData, fog: { ...map.mapData.fog, revealed } });
        if (reveal) this.announce(campaignId, "A new area is revealed.");
        return null;
      }
      case "fog:settings": {
        const settings = raw as TableCommands["fog:settings"];
        const map = await this.requireMap(campaignId);
        await this.saveMap(map.id, { ...map.mapData, fog: { ...map.mapData.fog, ...settings } });
        await this.refreshFog(campaignId);
        return null;
      }
      case "combat:create":
        return this.createCombat(campaignId, raw as TableCommands["combat:create"]);
      case "combat:addToken": {
        const combat = await this.requireCombat(campaignId);
        const map = await this.requireMap(campaignId);
        const token = map.mapData.tokens.find((t) => t.id === (raw as TableCommands["combat:addToken"]).tokenId);
        if (!token) throw new NotFoundException("Token not found.");
        if (combat.state.combatants.some((c) => c.tokenId === token.id)) return null;
        const combatant = await this.combatantForToken(token, campaignId);
        if (!combatant) throw new BadRequestException("This token has no character or monster sheet.");
        const ops: Op[] = [{ op: "addCombatant", value: combatant }];
        let state = applyOps(combat.state, ops);
        if (state.status === "active") {
          const order = sortOrder(state);
          ops.push({ op: "order", before: combat.state.order, after: order });
          state = applyOps(combat.state, ops);
        }
        await this.saveCombat(combat.id, state, combat.pending);
        await this.log(campaignId, "combat", `${combatant.name} joins the combat`, [], ops, combat.id);
        return null;
      }
      case "combat:remove": {
        const combat = await this.requireCombat(campaignId);
        const { combatantId } = raw as TableCommands["combat:remove"];
        const c = getCombatant(combat.state, combatantId);
        const index = combat.state.combatants.findIndex((x) => x.id === combatantId);
        const ops: Op[] = [{ op: "order", before: combat.state.order, after: combat.state.order.filter((id) => id !== combatantId) }, { op: "removeCombatant", value: c, index }];
        await this.saveCombat(combat.id, applyOps(combat.state, ops), combat.pending);
        await this.log(campaignId, "combat", `${c.name} leaves the combat`, [], ops, combat.id);
        return null;
      }
      case "combat:rollInitiative": {
        const combat = await this.requireCombat(campaignId);
        const { combatantIds } = raw as TableCommands["combat:rollInitiative"];
        const result = rollInitiative(combat.state, secureRoller, combatantIds);
        await this.saveCombat(combat.id, result.state, combat.pending);
        const lines = result.rolls.map((r) => `${r.name}: ${r.roll} → ${r.total}`);
        await this.log(campaignId, "initiative", "Initiative", lines, result.ops, combat.id);
        this.announce(campaignId, `Initiative rolled. ${result.rolls.filter((r) => !combat.state.combatants.find((c) => c.id === r.id)?.hidden).map((r) => `${r.name} ${r.total}`).join(", ")}`, "gm");
        return null;
      }
      case "combat:setInitiative": {
        const combat = await this.requireCombat(campaignId);
        const { combatantId, value } = raw as TableCommands["combat:setInitiative"];
        const result = setInitiative(combat.state, combatantId, Math.round(Number(value)));
        await this.saveCombat(combat.id, result.state, combat.pending);
        return null;
      }
      case "combat:start": {
        const combat = await this.requireCombat(campaignId);
        let state = combat.state;
        const ops: Op[] = [];
        if (state.combatants.some((c) => c.initiative === null)) {
          const rolled = rollInitiative(state, secureRoller);
          ops.push(...rolled.ops);
          state = rolled.state;
        }
        const started = startCombat(state);
        ops.push(...started.ops);
        await this.saveCombat(combat.id, started.state, combat.pending);
        const first = started.state.combatants.find((c) => c.id === started.state.order[0]);
        await this.log(campaignId, "combat", "Combat starts", [`Round 1: ${first?.name}'s turn`], ops, combat.id);
        this.announce(campaignId, `Combat starts. ${first && !first.hidden ? `${first.name}'s turn.` : ""}`);
        return null;
      }
      case "combat:next": {
        const combat = await this.requireCombat(campaignId);
        const result = nextTurn(combat.state, secureRoller);
        await this.saveCombat(combat.id, result.state, [...combat.pending, ...result.pending]);
        await this.syncCharacters(result.state);
        await this.log(campaignId, "turn", result.summary[result.summary.length - 1] ?? "Next turn", result.summary, result.ops, combat.id);
        const current = result.state.combatants.find((c) => c.id === result.state.order[result.state.turnIndex]);
        this.announce(campaignId, current && !current.hidden ? `Round ${result.state.round}. ${current.name}'s turn.` : `Round ${result.state.round}.`);
        return null;
      }
      case "combat:end": {
        const combat = await this.requireCombat(campaignId);
        const result = endCombat(combat.state);
        await this.prisma.combat.update({ where: { id: combat.id }, data: { active: false, state: result.state as object, pending: [] } });
        await this.syncCharacters(result.state);
        await this.log(campaignId, "combat", "Combat ends", [], null, combat.id);
        this.announce(campaignId, "The combat is over.");
        return null;
      }
      case "combat:resolve": {
        const combat = await this.requireCombat(campaignId);
        const req = raw as TableCommands["combat:resolve"];
        const actor = getCombatant(combat.state, req.actorId);
        const action = actor.actions.find((a) => a.key === req.actionKey);
        if (!action) throw new BadRequestException(`${actor.name} has no action "${req.actionKey}".`);
        if (action.cost?.slotLevel && actor.slots) {
          const level = Math.max(action.cost.slotLevel, req.slotLevel ?? 0);
          if ((actor.slots.used[level] ?? 0) >= (actor.slots.max[level] ?? 0)) throw new BadRequestException(`${actor.name} has no level ${level} spell slot left.`);
        }
        const targetIds = req.targetIds.filter((id) => combat.state.combatants.some((c) => c.id === id));
        if (targetIds.length === 0 && action.targeting.type !== "self") throw new BadRequestException("Choose at least one target.");
        const proposal = resolveAction(combat.state, { actorId: actor.id, action, targetIds, slotLevel: req.slotLevel, advantage: req.advantage }, secureRoller);
        await this.saveCombat(combat.id, combat.state, [...combat.pending, proposal]);
        return proposal;
      }
      case "combat:effect": {
        const combat = await this.requireCombat(campaignId);
        const req = raw as TableCommands["combat:effect"];
        const targetIds = req.targetIds.filter((id) => combat.state.combatants.some((c) => c.id === id));
        if (targetIds.length === 0) throw new BadRequestException("Choose at least one target.");
        const proposal = manualEffectProposal(combat.state, { targetIds, effect: req.effect, title: req.title, sourceId: req.sourceId }, secureRoller);
        await this.saveCombat(combat.id, combat.state, [...combat.pending, proposal]);
        return proposal;
      }
      case "combat:deathSave": {
        const combat = await this.requireCombat(campaignId);
        const c = getCombatant(combat.state, (raw as TableCommands["combat:deathSave"]).combatantId);
        const proposal = deathSaveProposal(c, secureRoller);
        await this.saveCombat(combat.id, combat.state, [...combat.pending, proposal]);
        return proposal;
      }
      case "combat:apply": {
        const combat = await this.requireCombat(campaignId);
        const edited = (raw as TableCommands["combat:apply"]).proposal;
        const pending = combat.pending.find((x) => x.id === edited.id);
        if (!pending) throw new BadRequestException("This result was already applied or discarded.");
        // The game master may edit everything but the identity of the result.
        const proposal: Proposal = { ...edited, id: pending.id, kind: pending.kind, actorId: pending.actorId, cost: pending.cost };
        for (const t of proposal.targets) getCombatant(combat.state, t.targetId);
        const result = applyProposal(combat.state, proposal);
        await this.saveCombat(combat.id, result.state, combat.pending.filter((x) => x.id !== pending.id));
        await this.syncCharacters(result.state);
        await this.log(campaignId, proposal.kind, proposal.title, result.summary, result.ops, combat.id);
        this.announce(campaignId, this.publicSummary(result.state, proposal, result.summary));
        return null;
      }
      case "combat:discard": {
        const combat = await this.requireCombat(campaignId);
        const { proposalId } = raw as TableCommands["combat:discard"];
        await this.saveCombat(combat.id, combat.state, combat.pending.filter((x) => x.id !== proposalId));
        return null;
      }
      case "combat:undo": {
        const { entryId } = raw as TableCommands["combat:undo"];
        const entry = await this.prisma.logEntry.findFirst({ where: { id: entryId, campaignId } });
        if (!entry?.ops || entry.undone) throw new BadRequestException("This entry can't be undone.");
        const combat = await this.prisma.combat.findFirst({ where: { id: entry.combatId ?? "" } });
        if (!combat) throw new BadRequestException("The combat of this entry no longer exists.");
        const state = applyOps(combat.state as unknown as CombatState, invertOps(entry.ops as unknown as Op[]));
        await this.prisma.combat.update({ where: { id: combat.id }, data: { state: state as object } });
        await this.prisma.logEntry.update({ where: { id: entry.id }, data: { undone: true } });
        await this.syncCharacters(state);
        await this.log(campaignId, "undo", `Undone: ${entry.title}`, [], null, combat.id);
        this.announce(campaignId, `Undone: ${entry.title}`, "gm");
        return null;
      }
      case "combat:removeStatus": {
        const combat = await this.requireCombat(campaignId);
        const { combatantId, statusId } = raw as TableCommands["combat:removeStatus"];
        const ops = removeStatusOps(combat.state, combatantId, statusId);
        if (!ops.length) return null;
        const state = applyOps(combat.state, ops);
        await this.saveCombat(combat.id, state, combat.pending);
        await this.syncCharacters(state, new Set([combatantId]));
        const c = getCombatant(combat.state, combatantId);
        const name = ops[0].op === "removeCondition" ? ops[0].value.condition : ops[0].op === "removeEffect" ? ops[0].value.name : "";
        await this.log(campaignId, "effect", `${name} removed from ${c.name}`, [], ops, combat.id);
        return null;
      }
      case "combat:visibility": {
        const combat = await this.requireCombat(campaignId);
        const { combatantId, hidden } = raw as TableCommands["combat:visibility"];
        const c = getCombatant(combat.state, combatantId);
        const ops: Op[] = [{ op: "set", id: c.id, field: "hidden", before: c.hidden, after: hidden }];
        await this.saveCombat(combat.id, applyOps(combat.state, ops), combat.pending);
        if (c.tokenId) {
          const map = await this.activeMap(campaignId);
          if (map) {
            const data = map.data as unknown as MapData;
            await this.saveMap(map.id, { ...data, tokens: data.tokens.map((t) => (t.id === c.tokenId ? { ...t, hidden } : t)) });
          }
        }
        return null;
      }
      case "area:targets": {
        const { area, casterTokenId } = raw as TableCommands["area:targets"];
        const map = await this.requireMap(campaignId);
        const combat = await this.activeCombat(campaignId);
        const placement = placeArea({ shape: area.shape, size: area.size, width: area.width }, area.origin, area.target);
        const tokens = tokensInArea(map.mapData, placement, area.shape === "emanation" ? casterTokenId : undefined);
        const combatantIds = combat ? combat.state.combatants.filter((c) => c.tokenId && tokens.some((t) => t.id === c.tokenId)).map((c) => c.id) : [];
        return { tokenIds: tokens.map((t) => t.id), combatantIds };
      }
      case "doc:reveal": {
        const { documentId } = raw as TableCommands["doc:reveal"];
        if (documentId) {
          const doc = await this.prisma.campaignDocument.findFirst({ where: { id: documentId, campaignId } });
          if (!doc) throw new NotFoundException("Document not found.");
          this.announce(campaignId, `New document: ${doc.title}`);
        }
        await this.prisma.campaign.update({ where: { id: campaignId }, data: { revealedDocumentId: documentId } });
        return null;
      }
      case "roll": {
        const r = raw as TableCommands["roll"];
        return this.dice.roll(userId, { expression: r.expression, label: r.label, visibility: r.visibility, campaignId, characterId: r.characterId, advantage: r.advantage });
      }
      default:
        void p;
        throw new BadRequestException(`Unknown command ${String(name)}.`);
    }
  }

  /** Announcement for screen readers; hidden creatures are not named. */
  private publicSummary(state: CombatState, proposal: Proposal, lines: string[]): string {
    const hiddenNames = state.combatants.filter((c) => c.hidden).map((c) => c.name);
    const visibleLines = lines.filter((l) => !hiddenNames.some((n) => l.includes(n)));
    const actor = proposal.actorId ? state.combatants.find((c) => c.id === proposal.actorId) : undefined;
    const title = actor?.hidden ? "Something happens." : proposal.title;
    return [title, ...visibleLines.map((l) => l.replace(/\(\d+ → \d+ HP\)/, ""))].join(". ");
  }

  private async moveToken(campaignId: string, req: TableCommands["token:move"]) {
    const map = await this.requireMap(campaignId);
    const token = map.mapData.tokens.find((t) => t.id === req.tokenId);
    if (!token) throw new NotFoundException("Token not found.");
    const to = { col: Math.round(req.col), row: Math.round(req.row) };
    if (to.col < 0 || to.row < 0 || to.col + token.size > map.mapData.grid.cols || to.row + token.size > map.mapData.grid.rows) {
      throw new BadRequestException("The token can't leave the map.");
    }
    if (!req.force && moveBlocked(map.mapData, token, to)) throw new BadRequestException("A wall or a closed door blocks this move.");
    const data: MapData = { ...map.mapData, tokens: map.mapData.tokens.map((t) => (t.id === token.id ? { ...t, col: to.col, row: to.row } : t)) };
    await this.saveMap(map.id, data);
    await this.refreshFog(campaignId);
    const fog = computeFog(data);
    const moved = data.tokens.find((t) => t.id === token.id)!;
    const revealed = new Set(data.fog.enabled ? fog.revealed : []);
    if (tokenVisibleToPlayers(data, moved, fog.visible, data.fog.enabled ? revealed : null)) {
      this.announce(campaignId, `${moved.name} moves to ${cellLabel(to)}.`);
    } else {
      this.announce(campaignId, `${moved.name} moves to ${cellLabel(to)}.`, "gm");
    }
    return null;
  }

  private async combatantForToken(token: Token, campaignId: string): Promise<Combatant | null> {
    if (token.characterId) {
      const character = await this.prisma.character.findFirst({ where: { id: token.characterId, campaignId } });
      if (!character) return null;
      const build = character.build as unknown as CharacterBuild;
      const st = character.state as unknown as CharacterState;
      const derived = derive(build, st, this.rules.rules);
      return combatantFromCharacter({ id: character.id, name: character.name }, derived, st, { id: newId("cbt"), tokenId: token.id });
    }
    if (token.monsterKey) {
      const monster = this.rules.rules.monster(token.monsterKey);
      if (!monster) return null;
      return combatantFromMonster(monster, { id: newId("cbt"), name: token.name, tokenId: token.id, hidden: token.hidden || token.layer === "gm", side: token.side });
    }
    return null;
  }

  private async createCombat(campaignId: string, req: TableCommands["combat:create"]) {
    const existing = await this.activeCombat(campaignId);
    if (existing) throw new BadRequestException("A combat is already in progress.");
    const map = await this.activeMap(campaignId);
    const state: CombatState = emptyCombat();
    if (map && req.includeTokens) {
      const data = map.data as unknown as MapData;
      for (const token of data.tokens) {
        if (token.kind === "object") continue;
        const c = await this.combatantForToken(token, campaignId);
        if (c) state.combatants.push(c);
      }
    }
    if (state.combatants.length === 0) {
      // No map: the party joins by default.
      const characters = await this.prisma.character.findMany({ where: { campaignId } });
      for (const character of characters) {
        const build = character.build as unknown as CharacterBuild;
        const st = character.state as unknown as CharacterState;
        state.combatants.push(combatantFromCharacter({ id: character.id, name: character.name }, derive(build, st, this.rules.rules), st));
      }
    }
    state.order = state.combatants.map((c) => c.id);
    const combat = await this.prisma.combat.create({ data: { campaignId, mapId: map?.id ?? null, state: state as object, pending: [] } });
    await this.log(campaignId, "combat", "Combat prepared", state.combatants.map((c) => c.name), null, combat.id);
    return { combatId: combat.id };
  }
}
