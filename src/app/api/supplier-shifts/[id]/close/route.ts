import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { closeSupplierShiftWithSnapshot } from "@/modules/suppliers/application/shift-service";
import { getSession, validateMutation } from "@/modules/auth/infrastructure/session";
import { enqueueBackupJob } from "@/shared/backup/backup-job-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateMutation(request, ["OWNER", "POS"])))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "انتهت جلسة الدخول." }, { status: 403 });
    const input = await request.json();
    const result = await closeSupplierShiftWithSnapshot((await params).id, input, session.role);
    try {
      await enqueueBackupJob({
        kind: "SHIFT_SNAPSHOT",
        artifactId: result.shift.id,
        filename: `dairy-shift-${result.shift.businessDate}-${result.shift.id}.json`,
        content: JSON.stringify((input as { snapshot?: unknown }).snapshot),
      });
    } catch {
      // Drive is additive; a durable close must not depend on backup availability.
    }
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر إغلاق الوردية.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
