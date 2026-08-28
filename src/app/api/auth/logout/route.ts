import { NextResponse } from "next/server";
import { endOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  await endOwnerSession();
  return NextResponse.json({ ok: true });
}
