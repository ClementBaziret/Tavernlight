import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import fs from "node:fs";
import { AssetsController, AssetsService } from "./assets/assets.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { CampaignsController } from "./campaigns/campaigns.controller";
import { CampaignsService } from "./campaigns/campaigns.service";
import { CharactersController } from "./characters/characters.controller";
import { CharactersService } from "./characters/characters.service";
import { AuthGuard } from "./common/auth";
import { CsrfMiddleware } from "./common/csrf";
import { WEB_DIST_DIR } from "./config/paths";
import { DiceController } from "./dice/dice.controller";
import { DiceService } from "./dice/dice.service";
import { EncountersController, EncountersService } from "./encounters/encounters.controller";
import { HealthController } from "./health.controller";
import { MapsController, MapsService } from "./maps/maps.controller";
import { NotesController, NotesService } from "./notes/notes.controller";
import { PrismaModule } from "./prisma/prisma.service";
import { RulesController } from "./rules/rules.controller";
import { RulesService } from "./rules/rules.service";
import { TableController } from "./table/table.controller";
import { TableGateway } from "./table/table.gateway";
import { TableService } from "./table/table.service";

// In production the API also serves the built web app (single origin).
const staticModules = fs.existsSync(WEB_DIST_DIR)
  ? [ServeStaticModule.forRoot({ rootPath: WEB_DIST_DIR, exclude: ["/api/{*path}", "/socket.io/{*path}"] })]
  : [];

@Module({
  imports: [PrismaModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]), ...staticModules],
  controllers: [
    HealthController,
    AuthController,
    RulesController,
    CampaignsController,
    CharactersController,
    DiceController,
    MapsController,
    AssetsController,
    EncountersController,
    NotesController,
    TableController,
  ],
  providers: [
    AuthService,
    RulesService,
    CampaignsService,
    CharactersService,
    DiceService,
    MapsService,
    AssetsService,
    EncountersService,
    NotesService,
    TableService,
    TableGateway,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes("{*splat}");
  }
}
