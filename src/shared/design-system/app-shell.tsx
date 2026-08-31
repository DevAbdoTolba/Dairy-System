"use client";

import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { listQueuedTransactions } from "@/shared/offline/offline-store";
import { OfflineStatus } from "./offline-status";

const links = [
  ["/dashboard", "الرئيسية", SpaceDashboardOutlinedIcon],
  ["/inventory", "المخزون", Inventory2OutlinedIcon],
  ["/history", "السجل", HistoryOutlinedIcon],
  ["/reports", "التقارير", AssessmentOutlinedIcon],
  ["/settings", "الإعدادات", SettingsOutlinedIcon],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [milkMenuAnchor, setMilkMenuAnchor] = useState<HTMLElement | null>(null);
  async function logout() {
    let queuedCount = 0;
    try {
      queuedCount = (await listQueuedTransactions()).length;
    } catch {
      // No outbox exists if this browser has disabled IndexedDB entirely.
    }
    if (queuedCount > 0) {
      window.alert("توجد عمليات لم تُزامن بعد. صِل الجهاز بالإنترنت وأكمل المزامنة قبل الخروج.");
      return;
    }
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      window.alert("تعذر تسجيل الخروج. تحقق من الاتصال ثم حاول مرة أخرى.");
      return;
    }
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ minHeight: 64, gap: 2 }}>
          <Typography variant="h2" component="p" sx={{ flexGrow: 1, color: "inherit" }}>
            نظام معمل الجبنة
          </Typography>
          <Button
            color="inherit"
            variant="outlined"
            startIcon={<SwapHorizOutlinedIcon />}
            sx={{ borderColor: "rgba(255,255,255,.7)", minHeight: 44 }}
            aria-controls={milkMenuAnchor ? "milk-mode-menu" : undefined}
            aria-expanded={Boolean(milkMenuAnchor)}
            aria-haspopup="menu"
            onClick={(event) => setMilkMenuAnchor(event.currentTarget)}
          >
            وضع اللبن
          </Button>
          <Button
            onClick={logout}
            color="inherit"
            variant="outlined"
            sx={{ borderColor: "rgba(255,255,255,.7)", minHeight: 44 }}
          >
            خروج
          </Button>
        </Toolbar>
      </AppBar>
      <Menu
        id="milk-mode-menu"
        anchorEl={milkMenuAnchor}
        open={Boolean(milkMenuAnchor)}
        onClose={() => setMilkMenuAnchor(null)}
      >
        <MenuItem component={Link} href="/pos" onClick={() => setMilkMenuAnchor(null)}>
          استلام اللبن — وضع المدير
        </MenuItem>
        <MenuItem component={Link} href="/suppliers" onClick={() => setMilkMenuAnchor(null)}>
          إدارة الموردين
        </MenuItem>
        <MenuItem component={Link} href="/supplier-prices" onClick={() => setMilkMenuAnchor(null)}>
          أسعار اللبن
        </MenuItem>
        <MenuItem
          component={Link}
          href="/supplier-accounts"
          onClick={() => setMilkMenuAnchor(null)}
        >
          حسابات الموردين
        </MenuItem>
        <MenuItem
          component={Link}
          href="/supplier-settlements"
          onClick={() => setMilkMenuAnchor(null)}
        >
          تسويات الموردين
        </MenuItem>
      </Menu>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, pb: 5 }}>
        <Stack
          component="nav"
          direction="row"
          spacing={1}
          useFlexGap
          aria-label="التنقل الرئيسي"
          sx={{ mb: 3, flexWrap: "wrap" }}
        >
          {links.map(([href, label, Icon]) => (
            <Button
              key={href}
              component={Link}
              href={href}
              variant={pathname === href ? "contained" : "outlined"}
              startIcon={<Icon />}
              sx={{ minWidth: 116 }}
            >
              {label}
            </Button>
          ))}
        </Stack>
        <OfflineStatus />
        {children}
      </Container>
    </Box>
  );
}
