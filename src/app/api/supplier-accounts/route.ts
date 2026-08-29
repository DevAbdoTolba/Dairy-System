import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  listPendingPosCash,
  listSupplierAccountSummaries,
  recordOwnerMovement,
} from "@/modules/suppliers/application/account-service";
import { hasOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  const [accounts, pendingCash] = await Promise.all([
    listSupplierAccountSummaries(),
    listPendingPosCash(),
  ]);
  return NextResponse.json({ accounts, pendingCash }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const result = await recordOwnerMovement(await request.json());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ الحركة.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
