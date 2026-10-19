import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import type { LoginInput, RegisterInput, UserDto } from "@tavernlight/shared";
import { PrismaService } from "../prisma/prisma.service";

const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  /** Small cache to avoid a database query on every request. */
  private readonly cache = new Map<string, { user: UserDto; expires: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterInput, userAgent?: string) {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account already exists with this email address.");
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({ data: { email, displayName: input.displayName, passwordHash } });
    return this.createSession(user, userAgent);
  }

  async login(input: LoginInput, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    // Same message whether the email or the password is wrong.
    const valid = user ? await argon2.verify(user.passwordHash, input.password) : false;
    if (!user || !valid) throw new UnauthorizedException("Wrong email or password.");
    return this.createSession(user, userAgent);
  }

  private async createSession(user: { id: string; email: string; displayName: string }, userAgent?: string) {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
    });
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  }

  async logout(token: string) {
    this.cache.delete(token);
    await this.prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async userForToken(token: string): Promise<UserDto | null> {
    const cached = this.cache.get(token);
    if (cached && cached.expires > Date.now()) return cached.user;
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) return null;
    const user = { id: session.user.id, email: session.user.email, displayName: session.user.displayName };
    this.cache.set(token, { user, expires: Date.now() + 60_000 });
    return user;
  }
}
