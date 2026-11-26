"use client";

import { useEffect } from "react";

/** Registra o service worker (somente em produção, para não atrapalhar o `next dev`). */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("Falha ao registrar service worker:", err);
    });
  }, []);
  return null;
}
