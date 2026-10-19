import { Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { documentSchema, noteSchema } from "@tavernlight/shared";
import { toDocumentDto, toNoteDto } from "../common/dto";
import type { z } from "zod";
import { AuthUser, CurrentUser } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { CampaignsService } from "../campaigns/campaigns.service";
import { PrismaService } from "../prisma/prisma.service";
import { TableService } from "../table/table.service";

type NoteInput = z.infer<typeof noteSchema>;
type DocumentInput = z.infer<typeof documentSchema>;



@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async findNote(campaignId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, campaignId } });
    if (!note) throw new NotFoundException("Note not found.");
    return note;
  }

  async findDocument(campaignId: string, id: string) {
    const doc = await this.prisma.campaignDocument.findFirst({ where: { id, campaignId } });
    if (!doc) throw new NotFoundException("Document not found.");
    return doc;
  }
}

/** Game master notes (NPCs, places, quests, free notes) and handouts. GM only. */
@Controller("campaigns/:campaignId")
export class NotesController {
  constructor(
    private readonly service: NotesService,
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly table: TableService,
  ) {}

  @Get("notes")
  async list(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Query("kind") kind?: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    const notes = await this.prisma.note.findMany({ where: { campaignId, ...(kind ? { kind } : {}) }, orderBy: { updatedAt: "desc" } });
    return notes.map(toNoteDto);
  }

  @Post("notes")
  async create(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Body(new ZodPipe(noteSchema)) body: NoteInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    const note = await this.prisma.note.create({ data: { campaignId, kind: body.kind, title: body.title, body: body.body, status: body.status } });
    return toNoteDto(note);
  }

  @Put("notes/:id")
  async update(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string, @Body(new ZodPipe(noteSchema)) body: NoteInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.service.findNote(campaignId, id);
    const note = await this.prisma.note.update({ where: { id }, data: { kind: body.kind, title: body.title, body: body.body, status: body.status ?? null } });
    return toNoteDto(note);
  }

  @HttpCode(204)
  @Delete("notes/:id")
  async remove(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.service.findNote(campaignId, id);
    await this.prisma.note.delete({ where: { id } });
  }

  @Get("documents")
  async documents(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const docs = await this.prisma.campaignDocument.findMany({ where: { campaignId }, orderBy: { updatedAt: "desc" } });
    return docs.map((d) => toDocumentDto(d, campaign.revealedDocumentId));
  }

  @Post("documents")
  async createDocument(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Body(new ZodPipe(documentSchema)) body: DocumentInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    const doc = await this.prisma.campaignDocument.create({ data: { campaignId, title: body.title, body: body.body, assetId: body.assetId ?? null } });
    await this.table.broadcast(campaignId);
    return toDocumentDto(doc, null);
  }

  @Put("documents/:id")
  async updateDocument(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string, @Body(new ZodPipe(documentSchema)) body: DocumentInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.service.findDocument(campaignId, id);
    const doc = await this.prisma.campaignDocument.update({ where: { id }, data: { title: body.title, body: body.body, assetId: body.assetId ?? null } });
    await this.table.broadcast(campaignId);
    return toDocumentDto(doc, null);
  }

  @HttpCode(204)
  @Delete("documents/:id")
  async removeDocument(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.service.findDocument(campaignId, id);
    await this.prisma.campaign.updateMany({ where: { id: campaignId, revealedDocumentId: id }, data: { revealedDocumentId: null } });
    await this.prisma.campaignDocument.delete({ where: { id } });
    await this.table.broadcast(campaignId);
  }
}
