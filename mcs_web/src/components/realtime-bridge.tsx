"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startRealtime } from "@/lib/realtime";

const KEYS_BY_TOPIC: Record<string, string[]> = {
  wo: [
    "work-orders", "work-order-detail", "work-order-materials", "approval-summary", "approval-list",
    "notifications", "dashboard", "void-center", "report", "recap-wo-all", "preventive-parts",
    "daily-control-unread", "daily-control-summary", "daily-control-activities", "daily-control-activity",
  ],
  approval: ["approval-summary", "approval-list", "notifications", "void-center", "dashboard"],
  "daily-control": [
    "daily-control-unread", "daily-control-summary", "daily-control-comments", "daily-control-activities",
    "daily-control-activity", "notifications",
  ],
  assets: ["assets", "asset-detail", "asset-attachments", "asset-custom-details", "asset-search", "asset-options", "bom-parts", "bom-photos", "report"],
  "asset-mutation": ["asset-mutations", "asset-mutation-detail", "asset-mutation-meta", "approval-summary", "approval-list"],
  material: ["material-usage", "material-usage-detail", "work-order-materials"],
  preventive: ["preventive-schedules", "preventive-schedule", "preventive-calendar", "preventive-parts", "work-orders"],
  master: ["master", "master-options", "master-activity"],
  "mcs-mobile": ["mcs-mobile-release", "mcs-mobile-devices"],
  dashboard: ["dashboard", "notifications"],
};

const BATCH_MS = 500;

export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let all = false;

    const flush = () => {
      timer = null;
      if (all) {
        all = false;
        pending.clear();
        void queryClient.invalidateQueries();
        return;
      }
      const keys = new Set(pending);
      pending.clear();
      if (keys.size === 0) return;
      void queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && keys.has(query.queryKey[0]),
      });
    };

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(flush, BATCH_MS);
    };

    const stop = startRealtime({
      onChange: (event) => {
        for (const topic of event.topics) {
          for (const key of KEYS_BY_TOPIC[topic] ?? []) pending.add(key);
        }
        schedule();
      },
      onResync: () => {
        all = true;
        schedule();
      },
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        all = true;
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);

  return null;
}
