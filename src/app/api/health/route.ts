import { NextResponse } from "next/server";
import { getDb } from "@/shared/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await (await getDb()).command({ ping: 1 });
    return NextResponse.json({ status: "ok", database: "mongodb", version: "0.2.0" });
  } catch {
    return NextResponse.json({ status: "error", database: "mongodb" }, { status: 503 });
  }
}
