import type { GameMap } from "@prisma/client";
import type { MapData } from "@tavernlight/engine";
import type { DocumentDto, MapDto, MapSummary, NoteDto, NoteKind } from "@tavernlight/shared";

/** Database rows -> API objects (kept free of services to avoid import cycles). */

export function toMapSummary(m: GameMap): MapSummary {
  return { id: m.id, name: m.name, description: m.description, gridType: m.gridType as "square" | "hex", cols: m.cols, rows: m.rows, updatedAt: m.updatedAt.toISOString() };
}

export function toMapDto(m: GameMap): MapDto {
  return { ...toMapSummary(m), campaignId: m.campaignId, data: m.data as unknown as MapData };
}

export function toNoteDto(n: { id: string; kind: string; title: string; body: string; status: string | null; updatedAt: Date }): NoteDto {
  return { id: n.id, kind: n.kind as NoteKind, title: n.title, body: n.body, status: n.status, updatedAt: n.updatedAt.toISOString() };
}

export function toDocumentDto(d: { id: string; title: string; body: string; assetId: string | null; updatedAt: Date }, revealedId: string | null): DocumentDto {
  return { id: d.id, title: d.title, body: d.body, assetId: d.assetId, revealed: d.id === revealedId, updatedAt: d.updatedAt.toISOString() };
}
