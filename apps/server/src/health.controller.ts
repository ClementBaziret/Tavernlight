import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/auth";
import { PrismaService } from "./prisma/prisma.service";
import { RulesService } from "./rules/rules.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    let rules: string | null = null;
    try {
      rules = this.rules.version.sourceVersion;
    } catch {
      rules = null;
    }
    return { status: "ok", rules };
  }
}
