"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BellRing, CheckCheck, MessageSquare, Send } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterDate } from "@/components/ui/filter-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, Textarea } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { useToast } from "@/components/ui/toast";
import {
  useDailyControlActivities,
  useDailyControlActivity,
  useDailyControlComments,
  useDailyControlMentionUsers,
  useDailyControlPartMentions,
  useDailyControlUnread,
  useDailyControlMutations,
} from "@/hooks/use-daily-control";
import { PERMISSIONS } from "@/lib/permissions";
import { toDateInput, formatDateTime, formatNumber } from "@/lib/format";
import { dash, pick } from "@/lib/display";
import { ApiError } from "@/types/api";

function getMentionTrigger(value: string) {
  const match = /(^|\s)([@#])([^\s@#]*)$/.exec(value);
  if (!match) return null;
  const tokenStart = value.length - match[0].length + (match[1] ? match[1].length : 0);
  return {
    kind: match[2] === "@" ? "user" as const : "part" as const,
    query: match[3] ?? "",
    start: tokenStart,
    end: value.length,
  };
}

/** Klasifikasi PRO / COR / PREV dari satu baris aktivitas (sama dgn V2 bridge). */
function classifyActivity(row: Record<string, unknown>): "pro" | "cor" | "prev" {
  const type = String(pick(row, ["type_wo", "type"]) || "").toUpperCase();
  const kind = String(pick(row, ["maintenance_kind"]) || "").toUpperCase();
  const src = String(pick(row, ["source_table"]) || "").toUpperCase();
  if (type.includes("PREV") || type.includes("PM") || kind.includes("PREVENTIVE"))
    return "prev";
  if (type.includes("CORR") || type.includes("CM") || kind.includes("CORRECTIVE"))
    return "cor";
  if (src.includes("PREVENTIVE") || type.includes("PRODUK")) return "pro";
  return "cor";
}

const MODULE_OPTS = [
  { value: "", label: "Semua modul" },
  { value: "meso", label: "MESO" },
  { value: "maintenance", label: "Maintenance" },
  { value: "is", label: "IS" },
  { value: "ga", label: "GA" },
  { value: "production", label: "Produksi" },
];

const MTC_CAT_OPTS = [
  { value: "", label: "Semua kategori" },
  { value: "MKL", label: "Mekanikal (MKL)" },
  { value: "ELC", label: "Elektrikal (ELC)" },
  { value: "SPL", label: "Sipil (SPL)" },
  { value: "OTO", label: "Otomotif (OTO)" },
];

const ACTIVITY_TYPE_OPTS = [
  { value: "", label: "Semua tipe" },
  { value: "pro", label: "PRO" },
  { value: "cor", label: "COR" },
  { value: "prev", label: "PREV" },
];

/** Area maintenance — value harus cocok dgn validasi backend `daily_control/list`. */
const AREA_OPTS = [
  { value: "", label: "Semua area" },
  { value: "gsu_inject", label: "GSU - Inject" },
  { value: "gsu_wnb", label: "GSU - WNB" },
  { value: "ru_sawmill", label: "RU - Sawmill" },
  { value: "ru_production", label: "RU - FJLB" },
];

const SRC_TO_MODULE: Record<string, string> = {
  tb_wo_mtc: "meso",
  tb_wo_mtc_operational: "maintenance",
  tb_wo_it: "is",
  tb_wo_ga: "ga",
  tb_wo_preventive: "production",
};
const INITIAL_RENDERED_ACTIVITIES = 50;

/** Modul aktivitas dari `source_table`, fallback prefix `wo_number`. */
function activityModule(row: Record<string, unknown>): string {
  const src = String(pick(row, ["source_table"]) || "").toLowerCase();
  if (SRC_TO_MODULE[src]) return SRC_TO_MODULE[src]!;
  const wo = String(pick(row, ["wo_number"]) || "").toUpperCase();
  if (wo.startsWith("WOIT")) return "is";
  if (wo.startsWith("WOGA")) return "ga";
  if (wo.startsWith("WOPR")) return "maintenance";
  if (wo.startsWith("PREV")) return "production";
  if (wo.startsWith("WO-") || wo.startsWith("WO/")) return "meso";
  return "";
}

/** Kategori MESO/MTC (MKL/ELC/SPL/OTO) dari beberapa field. */
function activityMtcCategory(row: Record<string, unknown>): string {
  const direct = String(pick(row, ["meso_subtype"]) || "").toUpperCase();
  if (["MKL", "ELC", "SPL", "OTO"].includes(direct)) return direct;
  const hay = [
    pick(row, ["executor_code_raw"]),
    pick(row, ["job_executor"]),
    pick(row, ["category_maintenance"]),
    pick(row, ["division_code"]),
  ]
    .join(" ")
    .toUpperCase();
  for (const c of ["MKL", "ELC", "SPL", "OTO"]) {
    if (new RegExp(`(^|[^A-Z])${c}([^A-Z]|$)`).test(hay)) return c;
  }
  if (/MEKANIK/.test(hay)) return "MKL";
  if (/ELEKTRIK|ELECTRIC/.test(hay)) return "ELC";
  if (/SIPIL|CIVIL/.test(hay)) return "SPL";
  if (/OTOMOTIF|AUTOMOTIVE/.test(hay)) return "OTO";
  return "";
}

export default function DailyControlPage() {
  return (
    <PermissionGuard permission={PERMISSIONS.dailyControl} mode="page">
      <DailyControlInner />
    </PermissionGuard>
  );
}

function DailyControlInner() {
  const toast = useToast();
  const today = toDateInput(new Date());
  const [date, setDate] = useState(today);
  const [module, setModule] = useState("");
  // Dropdown ke-2 tergantung modul:
  //  - MESO         -> kategori MKL/ELC/SPL/OTO  (disaring di client via meso_subtype)
  //  - Maintenance  -> area GSU/RU               (dikirim ke backend sbg param `area`)
  const [mtcCat, setMtcCat] = useState("");
  const [area, setArea] = useState("");
  const [activityType, setActivityType] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDERED_ACTIVITIES);

  // Menjaga dropdown tetap responsif saat filter harus mengevaluasi banyak
  // aktivitas; React menyelesaikan daftar hasil di prioritas lebih rendah.
  const deferredModule = useDeferredValue(module);
  const deferredMtcCat = useDeferredValue(mtcCat);
  const deferredActivityType = useDeferredValue(activityType);

  const showCat = module === "meso";
  const showArea = module === "maintenance";

  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [commentText, setCommentText] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const comments = useDailyControlComments(activeId);
  const activityDetail = useDailyControlActivity(activeId);
  const mentionTrigger = useMemo(() => getMentionTrigger(commentText), [commentText]);
  const userMentions = useDailyControlMentionUsers(
    mentionTrigger?.kind === "user" ? mentionTrigger.query : "",
    Boolean(activeId !== null && mentionTrigger?.kind === "user"),
  );
  const partMentions = useDailyControlPartMentions(
    activeId,
    Boolean(activeId !== null && mentionTrigger?.kind === "part"),
  );

  // 200 cukup untuk mempertahankan hasil feed harian yang sama pada UI saat ini,
  // tanpa mengirim enrichment detail yang sebelumnya membuat endpoint lambat.
  const filters = { date, division: (showArea && area) || undefined, per_page: 200 };
  // Feed sudah berisi semua modul; `source_table` + `meso_subtype` per baris
  // dipakai untuk menyaring modul & kategori MESO di client.
  const activities = useDailyControlActivities(filters);
  const unreadFeed = useDailyControlUnread();
  const { markRead, comment: postComment } = useDailyControlMutations();

  const resetSubFilters = () => {
    setMtcCat("");
    setArea("");
  };

  const moduleRows = useMemo(() => {
    const all = activities.data?.data ?? [];
    return all.filter((r) => {
      const rec = r as Record<string, unknown>;
      if (deferredModule && activityModule(rec) !== deferredModule) return false;
      if (deferredModule === "meso" && deferredMtcCat && activityMtcCategory(rec) !== deferredMtcCat) return false;
      return true;
    });
  }, [activities.data, deferredModule, deferredMtcCat]);
  const rows = useMemo(
    () =>
      deferredActivityType
        ? moduleRows.filter(
            (row) => classifyActivity(row as Record<string, unknown>) === deferredActivityType,
          )
        : moduleRows,
    [moduleRows, deferredActivityType],
  );
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  // Feed V2 sudah menyusun nama pelaksana/PIC + pengupdate. Pertahankan
  // informasi ini saat drawer mengambil detail lengkap (termasuk media).
  const selectedActivity = useMemo(
    () =>
      activeId == null
        ? undefined
        : (rows.find((row) => String(row.id) === String(activeId)) as
            | Record<string, unknown>
            | undefined),
    [activeId, rows],
  );

  // Saat data atau filter berubah, kembali render batch awal agar DOM tidak
  // menyimpan ratusan item dari filter sebelumnya.
  useEffect(() => {
    setVisibleCount(INITIAL_RENDERED_ACTIVITIES);
  }, [date, module, mtcCat, area, activityType, activities.data]);

  const { pro, cor, prev, unreadCount } = useMemo(() => {
    let p = 0,
      c = 0,
      pv = 0,
      u = 0;
    for (const r of moduleRows) {
      const cls = classifyActivity(r as Record<string, unknown>);
      if (cls === "pro") p++;
      else if (cls === "prev") pv++;
      else c++;
      if (
        Number(pick(r as Record<string, unknown>, ["unread_count"]) || 0) > 0 ||
        (r as Record<string, unknown>).is_unread === true
      )
        u++;
    }
    return { pro: p, cor: c, prev: pv, unreadCount: u };
  }, [moduleRows]);
  const unreadItems = unreadFeed.data?.data?.activities ?? [];
  const totalUnread = Number(unreadFeed.data?.data?.count ?? unreadCount);

  const openActivity = (id: string | number, unread = false) => {
    setActiveId(id);
    if (unread) markRead.mutate({ activity_id: id });
  };

  const mentionSuggestions = useMemo(() => {
    if (!mentionTrigger) return [];
    const source = mentionTrigger.kind === "user"
      ? (userMentions.data?.data ?? [])
      : (partMentions.data?.data ?? []);
    const q = mentionTrigger.query.toLowerCase();
    return source.filter((item) => !q || item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionTrigger, userMentions.data, partMentions.data]);

  const insertMention = (text: string) => {
    if (!mentionTrigger) return;
    setCommentText((current) =>
      `${current.slice(0, mentionTrigger.start)}${text} ${current.slice(mentionTrigger.end)}`,
    );
    window.setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const submitComment = async () => {
    if (!activeId || !commentText.trim()) return;
    try {
      await postComment.mutateAsync({ activity_id: activeId, body: commentText.trim() });
      setCommentText("");
      toast.success("Komentar terkirim");
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  const stat = [
    { label: "PRO", value: pro, tone: "blue" as const },
    { label: "COR", value: cor, tone: "amber" as const },
    { label: "PREV", value: prev, tone: "violet" as const },
  ];

  return (
    <PageContainer
      title="Daily Control"
      description="Aktivitas WO harian (PRO / COR / PREV). Pilih modul dulu — MESO memunculkan pilihan kategori (MKL/ELC/SPL/OTO), Maintenance memunculkan pilihan area (GSU/RU)."
      actions={
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await markRead.mutateAsync({ all: true });
              toast.success("Semua ditandai terbaca");
            } catch (e) {
              toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
            }
          }}
          disabled={!totalUnread || markRead.isPending}
        >
          <CheckCheck className="h-4 w-4" />
          Tandai semua terbaca
          {totalUnread ? (
            <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-xs font-semibold text-rose-600">
              {formatNumber(totalUnread)}
            </span>
          ) : null}
        </Button>
      }
    >
      <FilterBar
        onRefresh={() => activities.refetch()}
        isFetching={activities.isFetching}
      >
        <FilterDate label="Tanggal" value={date} onChange={setDate} />
        <select
          className="input-base h-9 w-40"
          value={module}
          onChange={(e) => {
            setModule(e.target.value);
            resetSubFilters();
          }}
          aria-label="Modul"
        >
          {MODULE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Dropdown ke-2: isi tergantung modul terpilih */}
        {showCat ? (
          <select
            className="input-base h-9 w-44"
            value={mtcCat}
            onChange={(e) => setMtcCat(e.target.value)}
            aria-label="Kategori MESO"
          >
            {MTC_CAT_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : showArea ? (
          <select
            className="input-base h-9 w-44"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            aria-label="Area Maintenance"
          >
            {AREA_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="input-base h-9 w-36"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
          aria-label="Tipe aktivitas"
        >
          {ACTIVITY_TYPE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FilterBar>

      <div className="grid grid-cols-3 gap-3">
        {stat.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setActivityType((current) => (current === c.label.toLowerCase() ? "" : c.label.toLowerCase()))}
            className={`card p-4 text-center transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
              activityType === c.label.toLowerCase() ? "border-brand-500 bg-brand-50" : ""
            }`}
            aria-pressed={activityType === c.label.toLowerCase()}
            title={`Filter aktivitas ${c.label}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {c.label}
            </p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {activities.isLoading ? "…" : formatNumber(c.value ?? 0)}
            </p>
          </button>
        ))}
      </div>

      {unreadItems.length > 0 ? (
        <section className="card overflow-hidden border-brand-100">
          <div className="flex items-center justify-between border-b border-brand-100 bg-brand-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">
                <BellRing className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Chat belum dibaca</h3>
                <p className="text-xs text-slate-500">Pembaruan terbaru dari aktivitas work order.</p>
              </div>
            </div>
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
              {formatNumber(totalUnread)} baru
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {unreadItems.slice(0, 4).map((item, index) => {
              const id = item.id ?? (item as Record<string, unknown>).daily_control_id;
              if (id == null) return null;
              const record = item as Record<string, unknown>;
              const title = pick(record, ["job_title", "maintenance_action_label", "title", "wo_number"]);
              const sender = pick(record, ["latest_unread_sender", "display_fullname", "display_name", "fullname"]);
              const message = pick(record, ["latest_unread_message"]);
              return (
                <button
                  key={String(id) + index}
                  type="button"
                  onClick={() => openActivity(id as string | number, true)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{dash(title)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      <b className="font-medium text-slate-700">{dash(sender)}</b>
                      {message ? ` · ${message}` : " mengirim pembaruan"}
                    </span>
                  </span>
                  <MessageSquare className="mt-1 h-4 w-4 shrink-0 text-brand-500" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Daftar Aktivitas</h3>
          <span className="text-xs text-slate-400">
            {rows.length} aktivitas · {formatNumber(totalUnread)} belum dibaca
          </span>
        </div>
        <div className="p-3">
          {activities.isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : activities.error ? (
            <ErrorState error={activities.error} onRetry={() => activities.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Tidak ada aktivitas"
              description="Tidak ada aktivitas Daily Control pada tanggal ini."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleRows.map((a, i) => {
                const unread = Number(pick(a, ["unread_count"]) || 0) > 0 || a.is_unread === true;
                const type = pick(a, ["type_wo", "type"]);
                const woNumber = pick(a, ["wo_number"]);
                const task = pick(a, [
                  "job_title",
                  "maintenance_action_label",
                  "keterangan",
                  "title",
                ]);
                const worker = pick(a, [
                  "display_fullname",
                  "display_name",
                  "created_by",
                  "fullname",
                  "executor_label",
                ]);
                const previewUrl = String(pick(a, ["preview_media_url"]) || "");
                return (
                  <li
                    key={(a.id as string) ?? woNumber ?? i}
                    onClick={() => a.id != null && openActivity(a.id as string | number, unread)}
                    className={`flex cursor-pointer items-start gap-3 px-2 py-3 hover:bg-slate-50 ${
                      unread ? "bg-brand-50/40" : ""
                    }`}
                  >
                    <div className="mt-1">
                      <span
                        className={`block h-2 w-2 rounded-full ${
                          unread ? "bg-brand-500" : "bg-slate-200"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {task || dash(type)}
                        </p>
                        {type ? <StatusBadge status={type} /> : null}
                        {unread ? (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                            Chat baru
                          </span>
                        ) : null}
                        {woNumber ? (
                          <span className="text-xs text-slate-400">{woNumber}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-medium text-slate-800">Dikerjakan oleh: </span>
                        {dash(worker)} · {formatDateTime(pick(a, ["activity_time", "activity_date", "created_at", "at"]))}
                        {pick(a, ["AssetCode", "asset_code"])
                          ? ` · ${pick(a, ["AssetCode", "asset_code"])}`
                          : ""}
                      </p>
                    </div>
                    {previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt={`Foto pekerjaan ${String(task || woNumber || "")}`}
                        width={56}
                        height={56}
                        unoptimized
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover"
                      />
                    ) : null}
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {(pick(a, ["comment_count"]) as string) || 0}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > visibleRows.length ? (
            <div className="flex justify-center border-t border-slate-100 pt-3">
              <Button
                variant="secondary"
                onClick={() => setVisibleCount((count) => count + INITIAL_RENDERED_ACTIVITIES)}
              >
                Muat {Math.min(INITIAL_RENDERED_ACTIVITIES, rows.length - visibleRows.length)} aktivitas lagi
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Drawer
        open={activeId !== null}
        onClose={() => {
          setActiveId(null);
          setCommentText("");
        }}
        title="Komentar Aktivitas"
        description={
          activityDetail.data?.data || selectedActivity
            ? String(pick({
                ...(activityDetail.data?.data as Record<string, unknown> | undefined),
                ...(selectedActivity ?? {}),
              }, ["job_title", "maintenance_action_label", "wo_number"]) || `Aktivitas #${activeId ?? ""}`)
            : `Aktivitas #${activeId ?? ""}`
        }
        footer={
          <div className="flex w-full items-end gap-2">
            <div className="relative min-w-0 flex-1">
              {mentionTrigger && mentionSuggestions.length > 0 ? (
                <div className="absolute bottom-full z-20 mb-2 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  {mentionSuggestions.map((item, index) => (
                    <button
                      key={`${item.insert_text}-${index}`}
                      type="button"
                      onClick={() => insertMention(item.insert_text)}
                      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-brand-50"
                    >
                      <span className="text-sm font-semibold text-slate-800">{item.insert_text}</span>
                      {mentionTrigger.kind === "user" && (item.fullname || item.division) ? (
                        <span className="text-xs text-slate-500">
                          {[item.fullname, item.division].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              <Textarea
                ref={commentInputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Tulis komentar… ketik @ untuk user atau # untuk part"
                className="min-h-[40px]"
              />
            </div>
            <Button
              onClick={submitComment}
              loading={postComment.isPending}
              disabled={!commentText.trim()}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {activityDetail.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : activityDetail.data?.data ? (
          (() => {
            const activity = activityDetail.data.data as Record<string, unknown>;
            const feedActivity = selectedActivity ?? {};
            const media = Array.isArray(activity.media) ? activity.media as Array<Record<string, unknown>> : [];
            const photos = media.filter((item) => {
              const type = String(item.media_type ?? "").toLowerCase();
              const url = String(item.media_url ?? item.url ?? "");
              return type === "image" || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
            });
            const task = pick(feedActivity, ["job_title", "maintenance_action_label", "keterangan", "title"])
              || pick(activity, ["job_title", "maintenance_action_label", "keterangan", "title"]);
            const worker = pick(feedActivity, ["display_fullname", "display_name", "fullname", "created_by"])
              || pick(activity, ["display_fullname", "display_name", "fullname", "created_by"]);
            return (
              <section className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-base font-semibold text-slate-900">{dash(task)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Dikerjakan oleh: </span>{dash(worker)}
                  {feedActivity.wo_number || activity.wo_number
                    ? ` · ${String(feedActivity.wo_number ?? activity.wo_number)}`
                    : ""}
                </p>
                {photos.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Foto aktivitas · {photos.length}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo, index) => {
                        const url = String(photo.media_url ?? photo.url ?? "");
                        return (
                          <a key={String(photo.id ?? index)} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <Image
                              src={url}
                              alt={`Foto aktivitas ${index + 1}`}
                              width={320}
                              height={320}
                              unoptimized
                              loading="lazy"
                              className="aspect-square w-full object-cover transition hover:scale-105"
                            />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })()
        ) : null}

        {comments.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : comments.error ? (
          <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
        ) : (comments.data?.data ?? []).length === 0 ? (
          <EmptyState
            title="Belum ada komentar"
            description="Jadilah yang pertama berkomentar pada aktivitas ini."
          />
        ) : (
          <ul className="space-y-3">
            {(comments.data?.data ?? []).map((c, i) => (
              <li
                key={(c.id as string) ?? i}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">
                    {dash(
                      pick(c as Record<string, unknown>, [
                        "author_name",
                        "actor",
                        "fullname",
                        "created_by_name",
                        "user_name",
                      ]),
                    )}
                  </p>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(
                      pick(c as Record<string, unknown>, ["created_at", "at"]),
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                  {dash(
                    pick(c as Record<string, unknown>, ["message", "body", "comment"]),
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </PageContainer>
  );
}
