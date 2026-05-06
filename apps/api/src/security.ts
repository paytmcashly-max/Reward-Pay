import crypto from "node:crypto";
import type { Role } from "@reward-wallet/shared";
import { AppError } from "./errors.js";

export type TokenPayload = {
  sub: string;
  role: Role;
  phone: string;
  kind: "user" | "admin";
  exp: number;
};

const base64url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const decodeBase64url = (value: string) => Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");

export const signToken = (
  payload: Omit<TokenPayload, "exp">,
  input: { secret: string; ttlSeconds: number },
) => {
  const completePayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + input.ttlSeconds,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(completePayload));
  const signature = crypto
    .createHmac("sha256", input.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

export const verifyToken = (token: string, secret: string): TokenPayload => {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new AppError("invalid_token", "Malformed access token", 401);
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError("invalid_token", "Invalid access token signature", 401);
  }

  const payload = JSON.parse(decodeBase64url(encodedPayload)) as TokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("expired_token", "Access token has expired", 401);
  }
  return payload;
};

export const verifyWebhookSignature = (input: { rawBody: string; signature: string; secret: string; timestamp?: string }) => {
  const signedPayload = input.timestamp ? `${input.timestamp}${input.rawBody}` : input.rawBody;
  const expected = crypto.createHmac("sha256", input.secret).update(signedPayload).digest("base64");
  const signature = input.signature.trim();
  if (signature.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};
