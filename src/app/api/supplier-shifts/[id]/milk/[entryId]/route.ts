import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { deleteMilkEntry, reviseMilkEntry } from "@/modules/suppliers/application/shift-service";
import { getSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

async function actorRole() {
  const session = await getSession();
  if (!session) throw new Error("انتهت جلسة الدخول.");
  return session.role;
}

function responseError(error: unknown, fallback: string) {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : fallback;
  return NextResponse.json({ error: message }, { status: 422 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  if (!(await validateMutation(request, ["OWNER", "POS"])))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const { id, entryId } = await params;
    const result = await reviseMilkEntry(id, entryId, await request.json(), await actorRole());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return responseError(error, "تعذر تعديل حركة اللبن.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  if (!(await validateMutation(request, ["OWNER", "POS"])))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const { id, entryId } = await params;
    const result = await deleteMilkEntry(id, entryId, await request.json(), await actorRole());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return responseError(error, "تعذر حذف حركة اللبن.");
  }
}
