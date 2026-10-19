import { Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { HttpException } from "@nestjs/common";
import type { Server, Socket } from "socket.io";
import type { CommandResult, TableCommands, TableView } from "@tavernlight/shared";
import { AuthService } from "../auth/auth.service";
import { SESSION_COOKIE, type AuthUser } from "../common/auth";
import { CampaignsService } from "../campaigns/campaigns.service";
import { gmRoom, playersRoom, TableService } from "./table.service";

interface SocketData {
  user?: AuthUser;
  campaignId?: string;
  view?: TableView;
  role?: "gm" | "player";
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Commands the players' view (or a player) may send. */
const PLAYER_COMMANDS = new Set<keyof TableCommands>(["roll"]);

function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "object" && response && "message" in response) return String((response as { message: unknown }).message);
    return error.message;
  }
  return error instanceof Error ? error.message : "Unexpected error.";
}

@WebSocketGateway({ namespace: "/table", cors: { origin: (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean), credentials: true } })
export class TableGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(TableGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly table: TableService,
    private readonly auth: AuthService,
    private readonly campaigns: CampaignsService,
  ) {}

  afterInit(server: Server) {
    this.table.attachServer(server);
    // Authenticate during the handshake, before any event can be received.
    server.use(async (socket, next) => {
      const token = (socket.handshake.auth?.token as string | undefined) ?? cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE);
      const user = token ? await this.auth.userForToken(token) : null;
      if (!user) return next(new Error("Please log in."));
      (socket.data as SocketData).user = user;
      next();
    });
  }

  handleConnection(socket: Socket) {
    if (!(socket.data as SocketData).user) socket.disconnect(true);
  }

  /** Joins the GM view (game master only) or the players' view of a campaign. */
  @SubscribeMessage("table:join")
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { campaignId: string; view: TableView }): Promise<CommandResult> {
    const data = socket.data as SocketData;
    try {
      if (!data.user) throw new Error("Please log in.");
      const role = await this.campaigns.roleOf(String(body.campaignId), data.user.id);
      const view: TableView = body.view === "gm" ? "gm" : "players";
      if (view === "gm" && role !== "gm") throw new Error("Only the game master can open this view.");
      for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
      data.campaignId = body.campaignId;
      data.view = view;
      data.role = role;
      await socket.join(view === "gm" ? gmRoom(body.campaignId) : playersRoom(body.campaignId));
      const state = view === "gm" ? await this.table.gmState(body.campaignId) : await this.table.playerState(body.campaignId);
      socket.emit("table:state", state);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage("table:command")
  async command(@ConnectedSocket() socket: Socket, @MessageBody() body: { name: keyof TableCommands; payload: unknown }): Promise<CommandResult> {
    const data = socket.data as SocketData;
    try {
      if (!data.user || !data.campaignId) throw new Error("Join a table first.");
      if (!(data.role === "gm" && data.view === "gm") && !PLAYER_COMMANDS.has(body.name)) {
        throw new Error("Only the game master can do this.");
      }
      // Permissions are checked again from the database for every command.
      const role = await this.campaigns.roleOf(data.campaignId, data.user.id);
      if (role !== "gm" && !PLAYER_COMMANDS.has(body.name)) throw new Error("Only the game master can do this.");
      const result = await this.table.execute(data.campaignId, data.user.id, body.name, (body.payload ?? {}) as never);
      return { ok: true, data: result };
    } catch (error) {
      this.logger.debug(`Command ${String(body?.name)} failed: ${errorMessage(error)}`);
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Round-trip measurement used by the latency indicator. */
  @SubscribeMessage("table:ping")
  ping(@MessageBody() body: { at: number }) {
    return { at: body?.at, serverAt: Date.now() };
  }
}
