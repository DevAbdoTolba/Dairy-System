import Box from "@mui/material/Box";
import { getSession } from "@/modules/auth/infrastructure/session";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/pos");
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
