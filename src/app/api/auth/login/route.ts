import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOwner } from "@/modules/auth/infrastructure/owner-auth";
import { startOwnerSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
const schema = z.object({ pin: z.string().min(6).max(128) });

export async function POST(request: Request) {
  try {
    const { pin } = schema.parse(await request.json());
    const subject = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!authenticateOwner(pin, subject))
      return NextResponse.json({ error: "رمز الدخول غير صحيح." }, { status: 401 });
    await startOwnerSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تسجيل الدخول." },
      { status: 400 },
    );
  }
}
