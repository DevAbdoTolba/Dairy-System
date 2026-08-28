import { requireOwner } from "@/modules/auth/infrastructure/session";
import { AppShell } from "@/shared/design-system/app-shell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <AppShell>{children}</AppShell>;
}
