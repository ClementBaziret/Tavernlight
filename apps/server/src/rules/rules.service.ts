import { Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { RulesIndex, type RulesData, type RulesKind, type RulesVersion } from "@tavernlight/engine";
import { PrismaService } from "../prisma/prisma.service";
import { LIST_KINDS, loadActiveRules } from "../srd/load";

/**
 * Keeps the active rule set in memory. The product never calls the external
 * SRD API at runtime: everything comes from the imported rule set.
 */
@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);
  private data: RulesData | null = null;
  private index: RulesIndex | null = null;
  private ruleSetId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const loaded = await loadActiveRules(this.prisma);
    if (!loaded) {
      this.logger.warn('No rules imported yet: run "pnpm srd:import".');
      return;
    }
    this.data = loaded.data;
    this.index = new RulesIndex(loaded.data);
    this.ruleSetId = loaded.id;
    this.logger.log(`Rules ${loaded.data.version.sourceVersion} loaded (${loaded.count} entries)`);
  }

  get rules(): RulesIndex {
    if (!this.index) throw new ServiceUnavailableException("The rules have not been imported yet.");
    return this.index;
  }

  get all(): RulesData {
    if (!this.data) throw new ServiceUnavailableException("The rules have not been imported yet.");
    return this.data;
  }

  get version(): RulesVersion & { id: string | null } {
    return { ...this.all.version, id: this.ruleSetId };
  }

  /** Subset of the rules for clients (e.g. the character builder). */
  bundle(kinds: string[]): Partial<RulesData> {
    const out: Partial<RulesData> = { version: this.all.version };
    for (const k of kinds) if (LIST_KINDS.includes(k as RulesKind)) (out as Record<string, unknown>)[k] = this.all[k as RulesKind];
    if (kinds.includes("encounters")) out.encounters = this.all.encounters;
    return out;
  }

  get<K extends RulesKind>(kind: K, key: string): RulesData[K][number] {
    const found = (this.all[kind] as { key: string }[]).find((x) => x.key === key);
    if (!found) throw new NotFoundException(`Unknown ${kind} "${key}".`);
    return found as RulesData[K][number];
  }
}
