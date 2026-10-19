import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Character } from "@prisma/client";
import { rollDiceTerm } from "@tavernlight/dice";
import {
  applyLevelUp,
  derive,
  emptyState,
  heal,
  initialState,
  isValid,
  levelUpPreview,
  longRest,
  rollAbilityScores,
  setTempHp,
  shortRest,
  takeDamage,
  useResource,
  useSlot,
  validateBuild,
  type CharacterBuild,
  type CharacterDetails,
  type CharacterState,
} from "@tavernlight/engine";
import type { CharacterAction, CharacterDto, CharacterSummary, CreateCharacterInput, LevelUpRequest } from "@tavernlight/shared";
import { secureRoller } from "../common/rng";
import { PrismaService } from "../prisma/prisma.service";
import { RulesService } from "../rules/rules.service";

type Listener = (character: Character) => void | Promise<void>;

@Injectable()
export class CharactersService {
  /** Ability scores rolled by the server, waiting to be used by a new character. */
  private readonly pendingRolls = new Map<string, { userId: string; scores: number[]; expires: number }>();
  private readonly listeners: Listener[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  /** The table subscribes to keep combatants in sync with character sheets. */
  onChange(listener: Listener) {
    this.listeners.push(listener);
  }

  private async emit(character: Character) {
    for (const l of this.listeners) await l(character);
  }

  // --- Access ----------------------------------------------------------------

  /** Owner, or game master of the character's campaign. */
  async access(id: string, userId: string, write = true): Promise<Character> {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundException("Character not found.");
    if (character.ownerId === userId) return character;
    if (character.campaignId) {
      const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId: character.campaignId, userId } } });
      if (member?.role === "gm" || (member && !write)) return character;
    }
    throw new ForbiddenException("You can't access this character.");
  }

  // --- DTOs -------------------------------------------------------------------

  toDto(c: Character): CharacterDto {
    const build = c.build as unknown as CharacterBuild;
    const state = c.state as unknown as CharacterState;
    const rules = this.rules.rules;
    return {
      id: c.id,
      ownerId: c.ownerId,
      campaignId: c.campaignId,
      build,
      state,
      details: c.details as CharacterDetails,
      derived: derive(build, state, rules),
      issues: validateBuild(build, rules),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async summaries(where: { campaignId?: string; ids?: string[] }): Promise<CharacterSummary[]> {
    const characters = await this.prisma.character.findMany({
      where: { ...(where.campaignId ? { campaignId: where.campaignId } : {}), ...(where.ids ? { id: { in: where.ids } } : {}) },
      include: { owner: { select: { displayName: true } }, campaign: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const rules = this.rules.rules;
    return characters.map((c) => {
      const build = c.build as unknown as CharacterBuild;
      const derived = derive(build, c.state as unknown as CharacterState, rules);
      return {
        id: c.id,
        name: c.name,
        ownerId: c.ownerId,
        ownerName: c.owner.displayName,
        campaignId: c.campaignId,
        campaignName: c.campaign?.name ?? null,
        species: rules.species(build.species)?.name ?? build.species,
        className: rules.class(build.class)?.name ?? build.class,
        level: build.level,
        hp: derived.currentHp,
        maxHp: derived.maxHp,
        ac: derived.ac,
        portraitAssetId: (c.details as CharacterDetails).portraitAssetId,
      };
    });
  }

  /** The user's characters plus those of the campaigns they run. */
  async listForUser(userId: string) {
    const gmCampaigns = await this.prisma.campaignMember.findMany({ where: { userId, role: "gm" }, select: { campaignId: true } });
    const characters = await this.prisma.character.findMany({
      where: { OR: [{ ownerId: userId }, { campaignId: { in: gmCampaigns.map((m) => m.campaignId) } }] },
      select: { id: true },
    });
    return this.summaries({ ids: characters.map((c) => c.id) });
  }

  async get(id: string, userId: string) {
    return this.toDto(await this.access(id, userId, false));
  }

  // --- Creation ------------------------------------------------------------------

  rollAbilities(userId: string) {
    const { scores, details } = rollAbilityScores(secureRoller);
    const token = randomBytes(16).toString("hex");
    this.pendingRolls.set(token, { userId, scores, expires: Date.now() + 3600_000 });
    for (const [k, v] of this.pendingRolls) if (v.expires < Date.now()) this.pendingRolls.delete(k);
    return { token, scores, details };
  }

  private assertValid(build: CharacterBuild) {
    const issues = validateBuild(build, this.rules.rules);
    if (!isValid(issues)) {
      throw new BadRequestException({ message: "The character is not valid.", issues: issues.filter((i) => i.severity === "error") });
    }
  }

  async create(userId: string, input: CreateCharacterInput) {
    const build = input.build as CharacterBuild;
    if (build.abilityMethod === "rolled") {
      const pending = input.rollToken ? this.pendingRolls.get(input.rollToken) : undefined;
      if (!pending || pending.userId !== userId) throw new BadRequestException("Roll your ability scores on the server first.");
      build.rolledScores = pending.scores;
      this.pendingRolls.delete(input.rollToken!);
    } else {
      delete build.rolledScores;
    }
    this.assertValid(build);
    const state = initialState(build, this.rules.rules, emptyState());
    const character = await this.prisma.character.create({
      data: { ownerId: userId, name: build.name, build: build as object, state: state as object, details: input.details as object },
    });
    return this.toDto(character);
  }

  async update(id: string, userId: string, input: { build?: CharacterBuild; details?: CharacterDetails }) {
    const character = await this.access(id, userId);
    const current = character.build as unknown as CharacterBuild;
    let build = current;
    if (input.build) {
      // Ability rolls can't be replaced from the client.
      build = { ...input.build, rolledScores: current.rolledScores, abilityMethod: current.abilityMethod === "rolled" ? "rolled" : input.build.abilityMethod };
      this.assertValid(build);
    }
    const updated = await this.prisma.character.update({
      where: { id },
      data: { build: build as object, name: build.name, ...(input.details ? { details: { ...(character.details as object), ...input.details } } : {}) },
    });
    await this.emit(updated);
    return this.toDto(updated);
  }

  async remove(id: string, userId: string) {
    const character = await this.access(id, userId);
    if (character.ownerId !== userId) throw new ForbiddenException("Only the owner can delete a character.");
    await this.prisma.character.delete({ where: { id } });
  }

  // --- Play -----------------------------------------------------------------------

  async act(id: string, userId: string, action: CharacterAction) {
    const character = await this.access(id, userId);
    const build = character.build as unknown as CharacterBuild;
    let state = character.state as unknown as CharacterState;
    const derived = derive(build, state, this.rules.rules);
    let extra: unknown = undefined;
    switch (action.type) {
      case "damage":
        state = takeDamage(state, derived, action.amount);
        break;
      case "heal":
        state = heal(state, derived, action.amount);
        break;
      case "tempHp":
        state = action.amount === 0 ? { ...state, tempHp: 0 } : setTempHp(state, action.amount);
        break;
      case "shortRest": {
        const result = shortRest(state, derived, action.hitDice, secureRoller);
        state = result.state;
        extra = result.spent;
        break;
      }
      case "longRest":
        state = longRest(state);
        break;
      case "slot":
        state = useSlot(state, derived, action.level, action.delta);
        break;
      case "resource":
        state = useResource(state, derived, action.key, action.delta);
        break;
      case "deathSave": {
        const saves = { ...state.deathSaves };
        if (action.success) saves.successes = Math.min(3, saves.successes + 1);
        else saves.failures = Math.min(3, saves.failures + 1);
        state = { ...state, deathSaves: saves };
        break;
      }
      case "conditions":
        state = { ...state, conditions: action.conditions, exhaustion: action.exhaustion };
        break;
      case "inventory":
        state = { ...state, inventory: action.inventory };
        break;
      case "currency":
        state = { ...state, currency: action.currency };
        break;
      case "notes":
        state = { ...state, notes: action.notes };
        break;
      case "inspiration":
        state = { ...state, inspiration: action.value };
        break;
    }
    const updated = await this.prisma.character.update({ where: { id }, data: { state: state as object } });
    await this.emit(updated);
    return { character: this.toDto(updated), extra };
  }

  /** Writes combat results (HP, slots, conditions) back into the sheet. */
  async saveState(id: string, state: CharacterState) {
    await this.prisma.character.update({ where: { id }, data: { state: state as object } });
  }

  // --- Level up ----------------------------------------------------------------------

  async preview(id: string, userId: string, subclass?: string) {
    const character = await this.access(id, userId, false);
    const preview = levelUpPreview(character.build as unknown as CharacterBuild, this.rules.rules, subclass);
    if (!preview) throw new BadRequestException("This character can't gain another level.");
    return preview;
  }

  async levelUp(id: string, userId: string, request: LevelUpRequest) {
    const character = await this.access(id, userId);
    const build = character.build as unknown as CharacterBuild;
    const cls = this.rules.rules.class(build.class);
    if (!cls) throw new BadRequestException("Unknown class.");
    const value = request.hp.method === "roll" ? rollDiceTerm(1, cls.hitDie, [], secureRoller).total : Math.floor(cls.hitDie / 2) + 1;
    const next = applyLevelUp(build, {
      hp: { method: request.hp.method, value },
      subclass: request.subclass,
      asi: request.asi,
      choices: request.choices,
      cantrips: request.cantrips,
      preparedSpells: request.preparedSpells,
    });
    this.assertValid(next);
    // Keep the current HP proportional: the new level adds its hit points.
    const state = character.state as unknown as CharacterState;
    const before = derive(build, state, this.rules.rules);
    const after = derive(next, state, this.rules.rules);
    const newState: CharacterState = { ...state, hp: state.hp === null ? null : Math.min(after.maxHp, before.currentHp + (after.maxHp - before.maxHp)) };
    const updated = await this.prisma.character.update({ where: { id }, data: { build: next as object, state: newState as object } });
    await this.emit(updated);
    return { character: this.toDto(updated), hpRoll: value };
  }
}
