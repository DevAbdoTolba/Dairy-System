import { NextResponse } from "next/server";
import { getSupplierAccount } from "@/modules/suppliers/application/account-service";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    return NextResponse.json(await getSupplierAccount((await params).id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحميل حساب المورد." },
      { status: 404 },
    );
  }
}
