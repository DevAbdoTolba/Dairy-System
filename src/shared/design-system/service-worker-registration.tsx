"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_DAIRY_OFFLINE === "true";
    if (!enabled) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        );
      return;
    }
    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    void navigator.storage?.persist?.();
  }, []);
  return null;
}
