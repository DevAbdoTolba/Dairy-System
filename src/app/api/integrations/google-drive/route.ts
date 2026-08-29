import { NextResponse } from "next/server";
import { hasOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";
import {
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  googleDriveAuthorizationUrl,
} from "@/shared/backup/google-drive-adapter";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  return NextResponse.json(await getGoogleDriveStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    return NextResponse.json({ authorizationUrl: googleDriveAuthorizationUrl() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر بدء ربط Google Drive." },
      { status: 422 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  await disconnectGoogleDrive();
  return NextResponse.json({ ok: true });
}
