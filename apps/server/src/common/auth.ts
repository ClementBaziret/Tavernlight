import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";

export const SESSION_COOKIE = "tl_session";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export type AuthedRequest = Request & { user?: AuthUser; sessionToken?: string };

const PUBLIC_KEY = "isPublic";
/** Marks a route as reachable without being logged in. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export function tokenFromRequest(req: { headers: Record<string, unknown>; cookies?: Record<string, string> }): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[SESSION_COOKIE];
}

/** Global guard: every route requires a valid session unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = tokenFromRequest(req);
    if (token) {
      const user = await this.auth.userForToken(token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException("Please log in.");
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});
