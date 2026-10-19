import "./config/env";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { seedDemo } from "./demo/demo";
import { importRules } from "./srd/importer";

/** Docker start-up: import the SRD and the demo campaign (both idempotent). */
async function bootstrapData() {
  const logger = new Logger("Bootstrap");
  const prisma = new PrismaClient();
  try {
    const report = await importRules(prisma);
    logger.log(report.created ? "SRD imported" : "SRD already imported");
    const demo = await seedDemo(prisma);
    logger.log(demo.created ? "Demo campaign created" : "Demo campaign already present");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.env.BOOTSTRAP === "true") await bootstrapData();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["log", "warn", "error"] });
  app.setGlobalPrefix("api", { exclude: [] });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          scriptSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  const origins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  app.set("trust proxy", 1);

  const docs = new DocumentBuilder().setTitle("Tavernlight API").setDescription("Virtual tabletop compatible with the 5th edition (SRD 5.2).").setVersion("0.1.0").addBearerAuth().build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, docs));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  new Logger("Tavernlight").log(`API listening on http://localhost:${port}/api (docs: /api/docs)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
