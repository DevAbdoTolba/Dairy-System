"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function cairoClock() {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(new Date());
}

export function PosShell({ children }: { children: React.ReactNode }) {
  const [time, setTime] = useState("");
  const [hasLeftFullscreen, setHasLeftFullscreen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const update = () => setTime(cairoClock());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let enteredFullscreen = false;
    const updateFullscreenState = () => {
      if (document.fullscreenElement) enteredFullscreen = true;
      else if (enteredFullscreen) setHasLeftFullscreen(true);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  async function leaveSession() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {hasLeftFullscreen && (
        <Button
          type="button"
          size="small"
          onClick={leaveSession}
          sx={{ position: "fixed", top: 6, left: 8, zIndex: 1, minHeight: 44 }}
        >
          خروج
        </Button>
      )}
      <Typography
        component="time"
        aria-label="الوقت الحالي"
        sx={{ display: "block", px: 2, pt: 1.25, textAlign: "right", fontWeight: 700 }}
      >
        {time}
      </Typography>
      <Container component="main" maxWidth={false} sx={{ px: { xs: 1, sm: 2 }, pb: 2 }}>
        {children}
      </Container>
    </Box>
  );
}
