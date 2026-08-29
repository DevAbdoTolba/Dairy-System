import crypto from "node:crypto";
import { getDb } from "@/shared/db";
import type { DriveBackupPort } from "./drive-backup-port";

type GoogleDriveIntegration = {
  _id: "google-drive";
  encryptedRefreshToken: string;
  folderId: string | null;
  connectedAt: string;
  updatedAt: string;
};

function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

function encryptionKey() {
  const value = process.env.DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY is required for Google Drive.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new Error("DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key.");
  return key;
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Stored Google Drive credential is invalid.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function stateSecret() {
  return process.env.DAIRY_SESSION_SECRET ?? "development-only-change-before-production";
}

export function createGoogleDriveState() {
  const payload = Buffer.from(
    JSON.stringify({ nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60 * 1000 }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function validateGoogleDriveState(state: string | null) {
  if (!state) return false;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return false;
  try {
    return (
      (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number }).exp! >
      Date.now()
    );
  } catch {
    return false;
  }
}

export function googleDriveAuthorizationUrl() {
  const values = config();
  if (!values) throw new Error("أضف إعدادات Google OAuth أولًا لربط Google Drive.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", values.clientId);
  url.searchParams.set("redirect_uri", values.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", createGoogleDriveState());
  return url.toString();
}

export async function connectGoogleDrive(code: string) {
  const values = config();
  if (!values) throw new Error("Google OAuth is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: values.clientId,
      client_secret: values.clientSecret,
      redirect_uri: values.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const result = (await response.json()) as { refresh_token?: string; error_description?: string };
  if (!response.ok || !result.refresh_token)
    throw new Error(result.error_description ?? "Google لم يعطِ رمز وصول دائمًا.");
  const timestamp = new Date().toISOString();
  const db = await getDb();
  await db.collection<GoogleDriveIntegration>("appIntegrations").updateOne(
    { _id: "google-drive" },
    {
      $set: { encryptedRefreshToken: encrypt(result.refresh_token), updatedAt: timestamp },
      $setOnInsert: { folderId: null, connectedAt: timestamp },
    },
    { upsert: true },
  );
}

export async function getGoogleDriveStatus() {
  const db = await getDb();
  const integration = await db
    .collection<GoogleDriveIntegration>("appIntegrations")
    .findOne({ _id: "google-drive" });
  return {
    configured: Boolean(config() && process.env.DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY),
    connected: Boolean(integration),
  };
}

export async function disconnectGoogleDrive() {
  const db = await getDb();
  await db.collection<GoogleDriveIntegration>("appIntegrations").deleteOne({ _id: "google-drive" });
}

async function accessToken(integration: GoogleDriveIntegration) {
  const values = config();
  if (!values) throw new Error("Google OAuth is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: values.clientId,
      client_secret: values.clientSecret,
      refresh_token: decrypt(integration.encryptedRefreshToken),
      grant_type: "refresh_token",
    }),
  });
  const result = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token)
    throw new Error(result.error_description ?? "تعذر تحديث Google Drive.");
  return result.access_token;
}

async function ensureFolder(token: string, integration: GoogleDriveIntegration) {
  if (integration.folderId) return integration.folderId;
  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Dairy System Backups",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const result = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !result.id)
    throw new Error(result.error?.message ?? "تعذر إنشاء مجلد النسخ في Google Drive.");
  const db = await getDb();
  await db
    .collection<GoogleDriveIntegration>("appIntegrations")
    .updateOne(
      { _id: "google-drive" },
      { $set: { folderId: result.id, updatedAt: new Date().toISOString() } },
    );
  return result.id;
}

export async function getGoogleDriveBackupPort(): Promise<DriveBackupPort | undefined> {
  if (!config() || !process.env.DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY) return undefined;
  const db = await getDb();
  const integration = await db
    .collection<GoogleDriveIntegration>("appIntegrations")
    .findOne({ _id: "google-drive" });
  if (!integration) return undefined;
  return {
    async upload(artifact) {
      const token = await accessToken(integration);
      const folderId = await ensureFolder(token, integration);
      const boundary = `dairy-${crypto.randomUUID()}`;
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({ name: artifact.filename, parents: [folderId] }),
        `--${boundary}`,
        `Content-Type: ${artifact.mimeType}`,
        "",
        artifact.content,
        `--${boundary}--`,
        "",
      ].join("\r\n");
      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      const result = (await response.json()) as { id?: string; error?: { message?: string } };
      if (!response.ok || !result.id)
        throw new Error(result.error?.message ?? "تعذر رفع النسخة إلى Google Drive.");
      return { remoteId: result.id };
    },
  };
}
