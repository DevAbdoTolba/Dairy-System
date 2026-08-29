import { NextResponse } from "next/server";
import { z } from "zod";
import { roles } from "@/modules/auth/domain/role";
import { authenticateOwner, authenticatePos } from "@/modules/auth/infrastructure/owner-auth";
import { startSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
const schema = z.object({ role: z.enum(roles), pin: z.string().min(6).max(128) });

export async function POST(request: Request) {
  try {
    const { role, pin } = schema.parse(await request.json());
    const subject = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const credential =
      role === "OWNER"
        ? await authenticateOwner(pin, subject)
        : await authenticatePos(pin, subject);
    if (!credential) return NextResponse.json({ error: "رمز الدخول غير صحيح." }, { status: 401 });
    await startSession(credential);
    const redirectTo = redirectForRole();
    return NextResponse.json({
      ok: true,
      role,
      redirectTo,
      credentialVersion: credential.credentialVersion,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تسجيل الدخول." },
      { status: 400 },
    );
  }
}

function redirectForRole() {
  return "/pos";
}
