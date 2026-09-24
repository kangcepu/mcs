"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PageHeaderProvider } from "@/components/layout/page-header-context";
import { useMe } from "@/hooks/use-auth";
import { getToken } from "@/lib/auth";
import { ApiError } from "@/types/api";
import { ErrorState } from "@/components/ui/states";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [checkedToken, setCheckedToken] = useState(false);
  const { isLoading, error, refetch } = useMe();

  useEffect(() => {
    if (!getToken()) {
      const { pathname, search } = window.location;
      router.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
    } else {
      setCheckedToken(true);
    }
  }, [router]);

  const toggleSidebar = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      setCollapsed((v) => !v);
    } else {
      setSidebarOpen((v) => !v);
    }
  }, []);

  if (!checkedToken || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Memuat sesi…</p>
        </div>
      </div>
    );
  }

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <PageHeaderProvider>
      <div className="flex h-dvh overflow-hidden bg-slate-50">
        <AppSidebar
          open={sidebarOpen}
          collapsed={collapsed}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <AppHeader onToggleSidebar={toggleSidebar} collapsed={collapsed} />
          <main className="min-h-0 flex-1">
            {/* framer-motion animasi lewat JS, bukan CSS animation/transition —
                aturan @media prefers-reduced-motion global di globals.css tidak
                otomatis meng-cover ini, jadi reduced-motion di-hormati manual
                lewat MotionConfig di sini. */}
            <MotionConfig reducedMotion="user">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="min-h-0"
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </MotionConfig>
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
