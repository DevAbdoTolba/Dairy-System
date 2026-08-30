"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
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

  useEffect(() => {
    const update = () => setTime(cairoClock());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let enteredFullscreen = false;
    const updateFullscreenState = () => {
      if (document.fullscreenElement) {
        enteredFullscreen = true;
        setHasLeftFullscreen(false);
      } else if (enteredFullscreen) setHasLeftFullscreen(true);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  function leaveShiftWorkspace() {
    window.dispatchEvent(new Event("dairy-pos-leave-shift"));
    setHasLeftFullscreen(false);
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {hasLeftFullscreen && (
        <Button
          type="button"
          size="small"
          onClick={leaveShiftWorkspace}
          sx={{ position: "fixed", top: "1vmin", left: "1vmin", zIndex: 1, minHeight: "5vmin" }}
        >
          مغادرة الوردية
        </Button>
      )}
      <Typography
        component="time"
        aria-label="الوقت الحالي"
        sx={{
          display: "block",
          px: "2vmin",
          pt: "1vmin",
          fontSize: "2vmin",
          lineHeight: 1.5,
          textAlign: "right",
          fontWeight: 700,
        }}
      >
        {time}
      </Typography>
      <Container component="main" maxWidth={false} sx={{ px: "1vmin", pb: "1vmin" }}>
        {children}
      </Container>
    </Box>
  );
}
