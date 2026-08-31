import { requirePosOrOwner } from "@/modules/auth/infrastructure/session";
import { PosShell } from "@/shared/design-system/pos-shell";

export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await requirePosOrOwner();
  return <PosShell>{children}</PosShell>;
}
