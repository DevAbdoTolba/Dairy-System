import { NextResponse } from "next/server";
import { z } from "zod";
import { getPosBootstrap } from "@/modules/suppliers/application/pos-service";
import { hasPosOrOwnerSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

const querySchema = z.object({ shiftId: z.string().uuid() });

export async function GET(request: Request) {
  if (!(await hasPosOrOwnerSession()))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const { shiftId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getPosBootstrap(shiftId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحميل بيانات الوردية." },
      { status: 422 },
    );
  }
}
