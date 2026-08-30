import { NextResponse } from "next/server";
import { getSupplierAccount } from "@/modules/suppliers/application/account-service";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";
import { milkTypes, type MilkType } from "@/modules/suppliers/domain/shift";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const milkType = new URL(request.url).searchParams.get("milkType");
    if (!milkType || !milkTypes.includes(milkType as MilkType))
      return NextResponse.json({ error: "نوع اللبن غير صحيح." }, { status: 422 });
    return NextResponse.json(await getSupplierAccount((await params).id, milkType as MilkType), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحميل حساب المورد." },
      { status: 404 },
    );
  }
}
