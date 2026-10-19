import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE } from "./auth";

/**
 * Cookie-authenticated requests that change data must come from an allowed
 * origin (the session cookie is also SameSite=Lax). Bearer-token clients
 * (mobile app) are not exposed to CSRF.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly allowed = new Set((process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean));

  use(req: Request, _res: Response, next: NextFunction) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.cookies?.[SESSION_COOKIE] || req.headers.authorization) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    const host = req.headers.host;
    if (origin === `http://${host}` || origin === `https://${host}` || this.allowed.has(origin)) return next();
    throw new ForbiddenException("Request origin not allowed.");
  }
}
