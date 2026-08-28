import Box from "@mui/material/Box";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await hasOwnerSession()) redirect("/dashboard");
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <LoginForm />
    </Box>
  );
}
