"use client";

import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function PosShell({ children, isOwner }: { children: React.ReactNode; isOwner: boolean }) {
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
            {isOwner ? "استلام اللبن — وضع المدير" : "استلام اللبن"}
          </Typography>
          {isOwner && (
            <Button
              component={Link}
              href="/dashboard"
              type="button"
              color="inherit"
              variant="outlined"
              startIcon={<SwapHorizOutlinedIcon />}
              sx={{ borderColor: "rgba(255,255,255,.7)", minHeight: 44 }}
            >
              العودة إلى نظام الجبنة
            </Button>
          )}
          <Button
            type="button"
            color="inherit"
            variant="outlined"
            startIcon={<LogoutOutlinedIcon />}
            onClick={logout}
            sx={{ borderColor: "rgba(255,255,255,.7)", minHeight: 44 }}
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
