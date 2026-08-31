import { NextResponse } from "next/server";
import { z } from "zod";
import { getPosBootstrap } from "@/modules/suppliers/application/pos-service";
import { getSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

const querySchema = z.object({ shiftId: z.string().uuid() });

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "OWNER" && session.role !== "POS"))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const { shiftId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(
      { ...(await getPosBootstrap(shiftId)), posCredentialVersion: session.credentialVersion },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحميل بيانات الوردية." },
      { status: 422 },
    );
  }
}
