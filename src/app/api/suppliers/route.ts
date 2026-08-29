import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createSupplier,
  listOwnerSuppliers,
} from "@/modules/suppliers/application/supplier-service";
import { hasOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  return NextResponse.json({ suppliers: await listOwnerSuppliers() });
}

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    return NextResponse.json(
      { supplier: await createSupplier(await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ المورد.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
