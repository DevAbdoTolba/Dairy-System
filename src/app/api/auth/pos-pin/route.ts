import { NextResponse } from "next/server";
import { z } from "zod";
import { changePosPin } from "@/modules/auth/infrastructure/owner-auth";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

const schema = z.object({ pin: z.string().min(6).max(128) });

export async function PUT(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    await changePosPin(schema.parse(await request.json()).pin);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تغيير رمز استلام اللبن." },
      { status: 422 },
    );
  }
}
