import { NextResponse } from "next/server";
import { getSession } from "@/modules/auth/infrastructure/session";
import { connectGoogleDrive, validateGoogleDriveState } from "@/shared/backup/google-drive-adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const redirect = new URL("/settings", request.url);
  const session = await getSession();
  const search = new URL(request.url).searchParams;
  if (session?.role !== "OWNER" || !validateGoogleDriveState(search.get("state"))) {
    redirect.searchParams.set("drive", "rejected");
    return NextResponse.redirect(redirect);
  }
  const code = search.get("code");
  if (!code) {
    redirect.searchParams.set("drive", "failed");
    return NextResponse.redirect(redirect);
  }
  try {
    await connectGoogleDrive(code);
    redirect.searchParams.set("drive", "connected");
  } catch {
    redirect.searchParams.set("drive", "failed");
  }
  return NextResponse.redirect(redirect);
}
