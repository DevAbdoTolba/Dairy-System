import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "dairy_owner_session";
const TTL_SECONDS = 12 * 60 * 60;

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

function encode() {
  const payload = Buffer.from(
    JSON.stringify({ sub: "owner", exp: Date.now() + TTL_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function isValid(value?: string) {
  if (!value) return false;
  const [payload, receivedSignature] = value.split(".");
  if (!payload || !receivedSignature) return false;
  const expected = signature(payload);
  if (
    receivedSignature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expected))
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: string;
      exp?: number;
    };
    return parsed.sub === "owner" && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function hasOwnerSession() {
  return isValid((await cookies()).get(COOKIE_NAME)?.value);
}

export async function requireOwner() {
  if (!(await hasOwnerSession())) redirect("/login");
}

export async function startOwnerSession() {
  (await cookies()).set(COOKIE_NAME, encode(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function endOwnerSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function validateMutation(request: Request) {
  if (!(await hasOwnerSession())) return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}
