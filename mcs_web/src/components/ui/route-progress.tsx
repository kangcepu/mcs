"use client";

import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Bar tipis di paling atas viewport yang bergerak selama ada query/mutation
 * berjalan, lalu menyelesaikan diri & memudar saat selesai. Memberi kesan
 * "web sedang memuat tapi cepat". Ringan: hanya CSS transition + 1 interval.
 */
export function RouteProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (timer.current) clearInterval(timer.current);
      if (hide.current) clearTimeout(hide.current);
      timer.current = null;
      hide.current = null;
    };

    if (busy) {
      clearTimers();
      setVisible(true);
      setProgress((p) => (p < 12 ? 12 : p));
      // Merangkak menuju ~90% dengan langkah mengecil — tak pernah "penuh"
      // sampai benar-benar selesai.
      timer.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.6, (90 - p) * 0.06)));
      }, 180);
    } else {
      clearTimers();
      setProgress((p) => (p > 0 ? 100 : 0));
      hide.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 260);
    }

    return clearTimers;
  }, [busy]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-brand-500"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease",
          boxShadow: "0 0 8px rgba(47,114,247,0.6)",
        }}
      />
    </div>
  );
}
