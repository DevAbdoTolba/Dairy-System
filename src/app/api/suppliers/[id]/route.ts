import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { editSupplier, setSupplierActive } from "@/modules/suppliers/application/supplier-service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

const activeSchema = z.object({ active: z.boolean() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const id = (await params).id;
    return NextResponse.json({ supplier: await editSupplier(id, await request.json()) });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر تعديل المورد.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const { active } = activeSchema.parse(await request.json());
    return NextResponse.json({ supplier: await setSupplierActive((await params).id, active) });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر تعديل المورد.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
