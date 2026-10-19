import { BadRequestException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import sharp from "sharp";
import type { CharacterDetails } from "@tavernlight/engine";
import { AuthUser, CurrentUser } from "../common/auth";
import { PrismaService } from "../prisma/prisma.service";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: string, file: Express.Multer.File, campaignId?: string) {
    if (!file) throw new BadRequestException("No file received.");
    if (!ALLOWED.includes(file.mimetype)) throw new BadRequestException("Only PNG, JPEG, WebP and GIF images are accepted.");
    if (campaignId) {
      const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
      if (!member) throw new ForbiddenException();
    }
    // Re-encoding strips metadata and rejects anything that isn't an image.
    let image: ReturnType<typeof sharp>;
    try {
      image = sharp(file.buffer, { limitInputPixels: 64_000_000 }).rotate();
    } catch {
      throw new BadRequestException("This file is not a readable image.");
    }
    const { data, info } = await image.resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const asset = await this.prisma.asset.create({
      data: { ownerId: userId, campaignId: campaignId ?? null, mime: "image/webp", width: info.width, height: info.height, bytes: data },
      select: { id: true, width: true, height: true },
    });
    return asset;
  }

  /**
   * Owners and game masters can read any asset of their campaigns. Players
   * only get the revealed handout and character portraits: map backgrounds
   * reach them only through the masked image of the table.
   */
  async canRead(assetId: string, userId: string): Promise<boolean> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { ownerId: true, campaignId: true } });
    if (!asset) return false;
    if (asset.ownerId === userId) return true;
    if (!asset.campaignId) return false;
    const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId: asset.campaignId, userId } } });
    if (!member) return false;
    if (member.role === "gm") return true;
    const campaign = await this.prisma.campaign.findUnique({ where: { id: asset.campaignId }, select: { revealedDocumentId: true } });
    if (campaign?.revealedDocumentId) {
      const doc = await this.prisma.campaignDocument.findUnique({ where: { id: campaign.revealedDocumentId }, select: { assetId: true } });
      if (doc?.assetId === assetId) return true;
    }
    const characters = await this.prisma.character.findMany({ where: { campaignId: asset.campaignId }, select: { details: true } });
    return characters.some((c) => (c.details as CharacterDetails).portraitAssetId === assetId);
  }
}

@Controller("assets")
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_BYTES } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Query("campaignId") campaignId?: string) {
    return this.assets.upload(user.id, file, campaignId);
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    if (!(await this.assets.canRead(id, user.id))) throw new NotFoundException();
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id } });
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(asset.bytes));
  }
}
