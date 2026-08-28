import { NextResponse } from "next/server";
import { getSqlite } from "@/shared/db";

export const runtime = "nodejs";
export function GET() {
  try {
    const integrity = getSqlite().pragma("quick_check", { simple: true });
    return NextResponse.json(
      { status: integrity === "ok" ? "ok" : "degraded", database: integrity, version: "0.1.0" },
      { status: integrity === "ok" ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
