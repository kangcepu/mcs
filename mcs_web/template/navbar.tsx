"use client";

// Template navbar/header utama aplikasi.

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, RefreshCw, UserCog, Wifi, WifiOff } from "lucide-react";
import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useMe, useLogout } from "@/hooks/use-auth";
import { useNotificationSummary } from "@/hooks/use-notifications";
import { usePageHeader } from "@/components/layout/page-header-context";
import { formatNumber } from "@/lib/format";
import { pick } from "@/lib/display";
import { cn } from "@/lib/utils";
import {
  getRealtimeConnectionState,
  subscribeRealtimeConnection,
} from "@/lib/realtime";

const ROUTE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  "work-orders": "Work Order",
  "daily-control": "Daily Control",
  assets: "Asset Management",
  "asset-mutations": "Asset Mutation",
  "material-usage": "Material Usage",
  "approval-center": "Approval Center",
  "void-center": "Void Center",
  "preventive-schedules": "Preventive Schedule",
  "master-data": "Master Data",
  reports: "Report",
  profile: "Profile",
};

function formatHeaderDate(date: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
  ];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Header hanya menampilkan menit dan tanggal; interval pendek juga
    // memastikan tanggal ikut berganti saat melewati tengah malam.
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return {
    time: now
      ? now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "",
    date: now ? formatHeaderDate(now) : "",
  };
}

function formatSyncTimestamp(date: Date | null): string {
  if (!date) return "Waiting for data";
  return date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(" at ", ", ");
}

function DataSyncStatus() {
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const realtimeState = useSyncExternalStore(
    subscribeRealtimeConnection,
    getRealtimeConnectionState,
    () => "disconnected",
  );
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const updateLastSync = () => {
      const latest = queryClient
        .getQueryCache()
        .getAll()
        .reduce(
          (value, query) =>
            query.state.status === "success"
              ? Math.max(value, query.state.dataUpdatedAt)
              : value,
          0,
        );
      if (latest > 0) {
        setLastSync((current) =>
          current?.getTime() === latest ? current : new Date(latest),
        );
      }
    };
    updateLastSync();
    return queryClient.getQueryCache().subscribe(updateLastSync);
  }, [queryClient]);

  const busy = fetching + mutating > 0;
  const status = !online
    ? "Offline"
    : busy
      ? "Syncing"
      : realtimeState === "connected"
        ? "Real-Time"
        : realtimeState === "connecting"
          ? "Connecting"
          : "Reconnecting";
  const healthy = online && realtimeState === "connected";
  const timestamp = formatSyncTimestamp(lastSync);
  const StatusIcon = !online ? WifiOff : busy ? RefreshCw : Wifi;

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center gap-2 rounded-xl border bg-white px-2",
        healthy ? "border-emerald-200" : "border-amber-200",
      )}
      title={`Data: ${status}. Last sync: ${timestamp}`}
      aria-label={`Data status: ${status}. Last sync: ${timestamp}`}
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          healthy
            ? "bg-emerald-50 text-emerald-600"
            : "bg-amber-50 text-amber-700",
        )}
      >
        <StatusIcon className={cn("h-[18px] w-[18px]", busy && "animate-spin")} />
      </span>
      <span className="hidden min-w-[172px] leading-tight md:block">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold",
            healthy ? "text-emerald-700" : "text-amber-700",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              healthy ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          Data: {status}
        </span>
        <span className="mt-0.5 block whitespace-nowrap text-[10px] tabular-nums text-slate-500">
          Last Sync: {timestamp}
        </span>
      </span>
    </div>
  );
}

/** Maksimal tiga huruf agar badge avatar tetap terbaca di header. */
function fullNameInitials(fullname?: string | null): string {
  const letters = (fullname ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

export function AppHeader({
  onToggleSidebar,
  collapsed,
}: {
  onToggleSidebar: () => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { data: user } = useMe();
  // Header memakai full name dengan avatar berupa inisial, tanpa foto profil.
  const displayName = user?.fullname || "Loading…";
  const avatarInitials = fullNameInitials(user?.fullname);
  const logout = useLogout();
  const { header } = usePageHeader();
  const clock = useClock();
  const [notifOpen, setNotifOpen] = useState(false);
  const notif = useNotificationSummary();
  const notifData = notif.data?.data;
  const notifItems = [
    ...(notifData?.preventive_wo ?? []),
    ...(notifData?.in_progress_wo ?? []),
  ];
  const notifCount =
    Number(notifData?.total_notifications ?? 0) || notifItems.length;

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = () => setNotifOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [notifOpen]);

  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const routeTitle = ROUTE_TITLES[segment] ?? "MCS";
  const title = header.title || routeTitle;
  // Sub-judul top bar = breadcrumb "Dashboard → <modul yang dibuka>",
  // bukan deskripsi halaman.
  const subtitle =
    segment === "dashboard" ? routeTitle : `Dashboard → ${routeTitle}`;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white pr-4">
      {/* Tombol collapse — tab gelap menyatu dengan tepi sidebar, keluar sedikit */}
      <button
        onClick={onToggleSidebar}
        aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        className="relative z-50 grid h-16 w-10 shrink-0 place-items-center rounded-r-[2rem] border-y border-r border-white/10 bg-gradient-to-b from-[#09111f] to-[#070d18] text-white shadow-[0_10px_20px_rgba(5,11,23,0.18)] transition-colors hover:from-[#111d31] hover:to-[#0d1728]"
      >
        <ChevronLeft
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            collapsed && "rotate-180",
          )}
        />
      </button>

      {/* Judul + breadcrumb */}
      <div className="min-w-0 flex-1 py-2">
        <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">
          {title}
        </p>
        <p className="truncate text-xs leading-tight text-slate-400">{subtitle}</p>
      </div>

      {/* Kanan */}
      <div className="flex items-center gap-4">
        <DataSyncStatus />

        <div className="hidden min-w-[152px] items-center justify-center gap-2 border-r border-slate-200 pr-4 lg:flex">
          <ClockIcon />
          <div className="min-w-[104px] text-center leading-tight">
            <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
              {clock.time || "--:--"}
            </p>
            <p className="text-[11px] text-slate-400">
              {clock.date || "-- --- ----"}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Notifications"
            onClick={(e) => {
              e.stopPropagation();
              setNotifOpen((v) => !v);
            }}
          >
            <Bell className="h-5 w-5" />
            {notifCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifCount > 99 ? "99+" : notifCount}
              </span>
            ) : null}
          </button>

          {notifOpen ? (
            <div
              className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">Notifications</p>
                <span className="text-xs text-slate-400">
                  {formatNumber(notifCount)} items
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notif.isLoading ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>
                ) : notifItems.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-400">
                    No notifications.
                  </p>
                ) : (
                  notifItems.slice(0, 20).map((n, i) => {
                    const wo = pick(n, ["wo_number", "no_wo"]);
                    const title = pick(n, ["job_title", "title", "description"]);
                    return (
                      <Link
                        key={(wo || i) + "-" + i}
                        href={wo ? `/work-orders?q=${encodeURIComponent(wo)}` : "/work-orders"}
                        onClick={() => setNotifOpen(false)}
                        className="block border-b border-slate-50 px-3 py-2 last:border-0 hover:bg-slate-50"
                      >
                        <p className="truncate text-sm font-medium text-slate-800">
                          {wo || "Work Order"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {title || pick(n, ["status"]) || "-"}
                        </p>
                      </Link>
                    );
                  })
                )}
              </div>
              <Link
                href="/work-orders"
                onClick={() => setNotifOpen(false)}
                className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
              >
                View all Work Orders
              </Link>
            </div>
          ) : null}
        </div>

        <div className="group relative">
          <button className="flex min-w-0 items-center gap-2" aria-label="Profile menu">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold tracking-tight text-brand-700 ring-1 ring-brand-200"
            >
              {avatarInitials}
            </span>
            <span className="hidden max-w-[220px] truncate text-sm font-medium text-slate-800 sm:block">
              {displayName}
            </span>
          </button>
          <div className="invisible absolute right-0 top-full z-40 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-800">
                {displayName}
              </p>
              <p className="truncate text-xs text-slate-400">
                {user?.email || user?.username}
              </p>
            </div>
            <Link
              href="/profile"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <UserCog className="h-4 w-4 text-slate-400" />
              Profile
            </Link>
            <button
              onClick={logout}
              className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
