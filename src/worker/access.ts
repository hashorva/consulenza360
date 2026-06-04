import type { Env } from "./types";
import { ApiError } from "./http";

type AccessJwk = JsonWebKey & { kid?: string };

type JwkSet = {
  keys: AccessJwk[];
};

export type AccessIdentity = {
  email?: string;
  sub?: string;
};

const jwksCache = new Map<string, { expiresAt: number; jwks: JwkSet }>();

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function hasExpectedAudience(payload: { aud?: string | string[] }, expectedAud: string) {
  if (Array.isArray(payload.aud)) return payload.aud.includes(expectedAud);
  return payload.aud === expectedAud;
}

function accessTokenFromRequest(request: Request) {
  const assertion = request.headers.get("CF-Access-JWT-Assertion");
  if (assertion) return assertion;

  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === "CF_Authorization") {
      return rawValue.join("=");
    }
  }

  return null;
}

async function getJwks(teamDomain: string): Promise<JwkSet> {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwks;
  }

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiError(401, "Unable to fetch Cloudflare Access certificates.");
  }

  const jwks = (await response.json()) as JwkSet;
  jwksCache.set(teamDomain, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    jwks,
  });
  return jwks;
}

function localDevelopmentIdentity(request: Request, env: Env): AccessIdentity | null {
  const hostname = new URL(request.url).hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (env.APP_ENV === "production" && !isLocalhost) {
    return null;
  }
  return { email: "local-dev@example.test" };
}

async function verifyAccessToken(token: string, teamDomain: string, expectedAud: string): Promise<AccessIdentity> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new ApiError(401, "Invalid Cloudflare Access assertion.");
  }

  const header = decodeJson<{ kid?: string; alg?: string }>(encodedHeader);
  const payload = decodeJson<{ aud?: string | string[]; exp?: number; email?: string; sub?: string }>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new ApiError(401, "Unsupported Cloudflare Access assertion.");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "Expired Cloudflare Access assertion.");
  }
  if (!hasExpectedAudience(payload, expectedAud)) {
    throw new ApiError(403, "Cloudflare Access audience mismatch.");
  }

  const jwks = await getJwks(teamDomain);
  const jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    throw new ApiError(401, "Cloudflare Access signing key not found.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(decodeBase64Url(encodedSignature)),
    toArrayBuffer(new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)),
  );

  if (!verified) {
    throw new ApiError(401, "Invalid Cloudflare Access signature.");
  }

  return {
    email: payload.email,
    sub: payload.sub,
  };
}

export async function getOptionalAccess(request: Request, env: Env): Promise<AccessIdentity | null> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    return localDevelopmentIdentity(request, env);
  }

  const token = accessTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    return await verifyAccessToken(token, env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
  } catch {
    return null;
  }
}

export async function requireAccess(request: Request, env: Env): Promise<AccessIdentity> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    const identity = localDevelopmentIdentity(request, env);
    if (identity) return identity;
    throw new ApiError(500, "Cloudflare Access validation is not configured.");
  }

  const token = accessTokenFromRequest(request);
  if (!token) {
    throw new ApiError(401, "Missing Cloudflare Access assertion.");
  }

  return verifyAccessToken(token, env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
}
