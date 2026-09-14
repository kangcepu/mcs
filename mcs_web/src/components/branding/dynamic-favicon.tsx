"use client";

import { useEffect } from "react";
import { useBranding } from "@/hooks/use-settings";

/**
 * Menyetel favicon & judul tab dari branding dinamis (dari /v2/settings/branding).
 * Dipasang sekali di root provider.
 */
export function DynamicFavicon() {
  const { data } = useBranding();
  const favicon = data?.data?.favicon_url;
  const appName = data?.data?.app_name;

  useEffect(() => {
    if (!favicon) return;
    const head = document.head;
    // Hapus favicon lama supaya tidak menang urutan.
    head
      .querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']")
      .forEach((el) => el.parentElement?.removeChild(el));
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = favicon;
    head.appendChild(link);
  }, [favicon]);

  useEffect(() => {
    if (!appName) return;
    const suffix = "Maintenance Control System";
    if (!document.title.includes(appName)) {
      document.title = `${appName} — ${suffix}`;
    }
  }, [appName]);

  return null;
}
