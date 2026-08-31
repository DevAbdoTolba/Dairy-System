import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  confirmSupplierSettlement,
  listSettlements,
} from "@/modules/suppliers/application/settlement-service";
import { hasOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  const supplierId = new URL(request.url).searchParams.get("supplierId") ?? undefined;
  return NextResponse.json(
    { settlements: await listSettlements(supplierId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const result = await confirmSupplierSettlement(await request.json());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError || error instanceof Error ? error.message : "تعذر اعتماد التسوية.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
