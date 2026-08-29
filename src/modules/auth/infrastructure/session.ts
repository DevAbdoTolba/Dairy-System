import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessOwnerArea, canAccessPosArea, isRole, type Role } from "../domain/role";
import { getCredentialVersion } from "./owner-auth";

const COOKIE_NAME = "dairy_session";
const LEGACY_OWNER_COOKIE_NAME = "dairy_owner_session";
const TTL_SECONDS = 12 * 60 * 60;

type Session = {
  sub: "owner" | "pos";
  role: Role;
  credentialVersion: number;
  exp: number;
};

function secret() {
  const value = process.env.DAIRY_SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("DAIRY_SESSION_SECRET is required in production.");
  }
  return value ?? "development-only-change-before-production";
}

function signature(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(session: Omit<Session, "exp">) {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + TTL_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function validSignature(payload: string, receivedSignature: string) {
  const expected = signature(payload);
  return (
    receivedSignature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expected))
  );
}

function decode(value?: string): Session | null {
  if (!value) return null;
  const [payload, receivedSignature] = value.split(".");
  if (!payload || !receivedSignature || !validSignature(payload, receivedSignature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
      string,
      unknown
    >;
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;
    if (parsed.sub === "owner" && !parsed.role) {
      return { sub: "owner", role: "OWNER", credentialVersion: 1, exp: parsed.exp };
    }
    if (
      (parsed.sub !== "owner" && parsed.sub !== "pos") ||
      !isRole(parsed.role) ||
      typeof parsed.credentialVersion !== "number" ||
      !Number.isInteger(parsed.credentialVersion) ||
      parsed.credentialVersion < 1
    ) {
      return null;
    }
    if (
      (parsed.role === "OWNER" && parsed.sub !== "owner") ||
      (parsed.role === "POS" && parsed.sub !== "pos")
    )
      return null;
    return {
      sub: parsed.sub,
      role: parsed.role,
      credentialVersion: parsed.credentialVersion,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const jar = await cookies();
  const session =
    decode(jar.get(COOKIE_NAME)?.value) ?? decode(jar.get(LEGACY_OWNER_COOKIE_NAME)?.value);
  if (!session) return null;
  return (await getCredentialVersion(session.role)) === session.credentialVersion ? session : null;
}

export async function hasOwnerSession() {
  const session = await getSession();
  return Boolean(session && canAccessOwnerArea(session.role));
}

export async function hasPosOrOwnerSession() {
  const session = await getSession();
  return Boolean(session && canAccessPosArea(session.role));
}

export async function requireOwner() {
  if (!(await hasOwnerSession())) redirect("/login");
}

export async function requirePosOrOwner() {
  if (!(await hasPosOrOwnerSession())) redirect("/login");
}

export async function startSession(input: { role: Role; credentialVersion: number }) {
  const session: Omit<Session, "exp"> = {
    sub: input.role === "OWNER" ? "owner" : "pos",
    role: input.role,
    credentialVersion: input.credentialVersion,
  };
  const jar = await cookies();
  jar.set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  jar.delete(LEGACY_OWNER_COOKIE_NAME);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  jar.delete(LEGACY_OWNER_COOKIE_NAME);
}

export const endOwnerSession = endSession;

export async function validateMutation(
  request: Request,
  allowedRoles: readonly Role[] = ["OWNER"],
) {
  const session = await getSession();
  if (!session || !allowedRoles.includes(session.role)) return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}
