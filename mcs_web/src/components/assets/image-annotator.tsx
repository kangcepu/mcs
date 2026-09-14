"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Minus,
  Pencil,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { getCustomDetailImageData } from "@/lib/api/equipment";
import { useSaveAnnotatedImage } from "@/hooks/use-equipment";
import { ApiError } from "@/types/api";

type Tool = "pen" | "circle" | "rect" | "line" | "arrow" | "text";

interface Shape {
  type: Tool;
  color: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: number[];
  text?: string;
}

const TOOLS: { key: Tool; label: string; icon: React.ReactNode }[] = [
  { key: "pen", label: "Coret bebas", icon: <Pencil className="h-4 w-4" /> },
  { key: "circle", label: "Lingkaran", icon: <Circle className="h-4 w-4" /> },
  { key: "rect", label: "Kotak", icon: <Square className="h-4 w-4" /> },
  { key: "line", label: "Garis", icon: <Minus className="h-4 w-4" /> },
  { key: "arrow", label: "Panah", icon: <ArrowUpRight className="h-4 w-4" /> },
  { key: "text", label: "Teks", icon: <Type className="h-4 w-4" /> },
];

const MAX_W = 900;

function basename(path: string) {
  return path.split("/").pop()?.split("?")[0] ?? path;
}

export function ImageAnnotator({
  open,
  onClose,
  assetCode,
  customDetailId,
  columnType,
  imagePath,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  assetCode: string;
  customDetailId: number | string;
  columnType: string;
  /** image_path dari DB (assets/docs/customDetails/xxx.png). */
  imagePath: string;
  onSaved?: (url: string) => void;
}) {
  const toast = useToast();
  const save = useSaveAnnotatedImage(assetCode);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const shapesRef = useRef<Shape[]>([]);
  const draftRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState("#ffd400");
  const [width, setWidth] = useState(4);
  const [ready, setReady] = useState(false);

  const src = useQuery({
    queryKey: ["cd-image-data", imagePath],
    queryFn: ({ signal }) => getCustomDetailImageData(imagePath, signal),
    enabled: open && Boolean(imagePath),
    staleTime: 0,
    gcTime: 0,
  });
  const dataUri = src.data?.data?.data_uri ?? "";

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const all = draftRef.current
      ? [...shapesRef.current, draftRef.current]
      : shapesRef.current;
    for (const s of all) drawShape(ctx, s);
  }, []);

  // (re)load image into an <img> then size the canvas
  useEffect(() => {
    if (!open || !dataUri) return;
    setReady(false);
    shapesRef.current = [];
    draftRef.current = null;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_W / img.width, 1);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
      }
      imgRef.current = img;
      setReady(true);
      redraw();
    };
    img.src = dataUri;
  }, [open, dataUri, redraw]);

  useEffect(() => {
    if (!open) {
      shapesRef.current = [];
      draftRef.current = null;
      imgRef.current = null;
      setReady(false);
    }
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = canvasRef.current!.width / r.width;
    const sy = canvasRef.current!.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const p = pos(e);
    if (tool === "text") {
      const text = window.prompt("Teks anotasi:");
      if (text && text.trim()) {
        shapesRef.current.push({
          type: "text",
          color,
          width,
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          text: text.trim(),
        });
        redraw();
        rerender();
      }
      return;
    }
    drawingRef.current = true;
    draftRef.current = {
      type: tool,
      color,
      width,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      points: tool === "pen" ? [p.x, p.y] : undefined,
    };
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !draftRef.current) return;
    const p = pos(e);
    draftRef.current.x2 = p.x;
    draftRef.current.y2 = p.y;
    if (draftRef.current.type === "pen") draftRef.current.points!.push(p.x, p.y);
    redraw();
  };

  const onUp = () => {
    if (!drawingRef.current || !draftRef.current) return;
    drawingRef.current = false;
    const d = draftRef.current;
    draftRef.current = null;
    const moved = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 3 || d.type === "pen";
    if (moved) {
      shapesRef.current.push(d);
      rerender();
    }
    redraw();
  };

  const undo = () => {
    shapesRef.current.pop();
    redraw();
    rerender();
  };
  const clearAll = () => {
    shapesRef.current = [];
    redraw();
    rerender();
  };

  const doSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let image: string;
    try {
      image = canvas.toDataURL("image/png");
    } catch {
      toast.error("Gagal mengekspor gambar", "Kanvas ter-taint (CORS).");
      return;
    }
    try {
      const res = await save.mutateAsync({
        image,
        row_id: customDetailId,
        column_type: columnType,
        original_filename: basename(imagePath),
      });
      toast.success("Anotasi disimpan");
      onSaved?.(res.data?.url ?? "");
      onClose();
    } catch (e) {
      toast.error(
        "Gagal menyimpan",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="Anotasi Gambar"
      description="Tambahkan lingkaran, kotak, panah, atau teks. Menyimpan akan menimpa foto asli."
      closeOnBackdrop={false}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={undo} disabled={!ready}>
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
            <Button variant="ghost" onClick={clearAll} disabled={!ready} className="text-rose-600">
              <Eraser className="h-4 w-4" />
              Hapus semua
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={doSave} loading={save.isPending} disabled={!ready}>
              Simpan
            </Button>
          </div>
        </div>
      }
    >
      {src.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : src.error ? (
        <ErrorState error={src.error} onRetry={() => src.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                title={t.label}
                onClick={() => setTool(t.key)}
                className={
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition " +
                  (tool === t.key
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            <label className="ml-1 inline-flex items-center gap-1.5 text-sm text-slate-500">
              Warna
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-500">
              Tebal
              <input
                type="range"
                min={1}
                max={14}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
              <span className="w-4 tabular-nums">{width}</span>
            </label>
          </div>

          <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="mx-auto block max-w-full cursor-crosshair touch-none bg-white"
            />
          </div>
          <p className="text-xs text-slate-400">
            {shapesRef.current.length} objek anotasi. Tool aktif: {tool}.
          </p>
        </div>
      )}
    </Modal>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.type === "pen" && s.points && s.points.length >= 4) {
    const pts = s.points;
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i + 1 < pts.length; i += 2) {
      ctx.lineTo(pts[i]!, pts[i + 1]!);
    }
    ctx.stroke();
  } else if (s.type === "circle") {
    const cx = (s.x1 + s.x2) / 2;
    const cy = (s.y1 + s.y2) / 2;
    const rx = Math.abs(s.x2 - s.x1) / 2;
    const ry = Math.abs(s.y2 - s.y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.type === "rect") {
    ctx.strokeRect(
      Math.min(s.x1, s.x2),
      Math.min(s.y1, s.y2),
      Math.abs(s.x2 - s.x1),
      Math.abs(s.y2 - s.y1),
    );
  } else if (s.type === "line" || s.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    if (s.type === "arrow") {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = Math.max(10, s.width * 3);
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(
        s.x2 - head * Math.cos(ang - Math.PI / 6),
        s.y2 - head * Math.sin(ang - Math.PI / 6),
      );
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(
        s.x2 - head * Math.cos(ang + Math.PI / 6),
        s.y2 - head * Math.sin(ang + Math.PI / 6),
      );
      ctx.stroke();
    }
  } else if (s.type === "text" && s.text) {
    const size = Math.max(14, s.width * 5);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.lineWidth = Math.max(2, size / 8);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(s.text, s.x1, s.y1);
    ctx.fillText(s.text, s.x1, s.y1);
  }
  ctx.restore();
}
