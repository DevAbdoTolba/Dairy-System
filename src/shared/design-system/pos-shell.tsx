"use client";

import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";

export function PosShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return;
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ minHeight: 60, gap: 2 }}>
          <Typography component="p" variant="h2" sx={{ color: "inherit", flexGrow: 1 }}>
            استلام اللبن
          </Typography>
          <Button
            type="button"
            color="inherit"
            variant="outlined"
            startIcon={<LogoutOutlinedIcon />}
            onClick={logout}
            sx={{ borderColor: "rgba(255,255,255,.7)" }}
          >
            خروج
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, pb: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
