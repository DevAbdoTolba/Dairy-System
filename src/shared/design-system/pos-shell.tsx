"use client";

import Box from "@mui/material/Box";
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

  useEffect(() => {
    const update = () => setTime(cairoClock());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Typography
        component="time"
        aria-label="الوقت الحالي"
        sx={{ display: "block", px: 2, pt: 1.25, textAlign: "center", fontWeight: 700 }}
      >
        {time}
      </Typography>
      <Container component="main" maxWidth={false} sx={{ px: { xs: 1, sm: 2 }, pb: 2 }}>
        {children}
      </Container>
    </Box>
  );
}
