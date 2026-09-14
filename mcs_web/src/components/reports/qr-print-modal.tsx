"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Printer } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { useQrReport } from "@/hooks/use-reports";
import { pick } from "@/lib/display";

function QrLabel({
  logoUrl,
  name,
  code,
  qrImage,
  qrContent,
}: {
  logoUrl: string;
  name: string;
  code: string;
  qrImage: string;
  qrContent: string;
}) {
  const longName = name.length > 30;
  return (
    <div className="qr-label">
      <div className="qr-label__row">
        <div className="qr-label__left">
          <span className="qr-label__caption">PROPERTY OF</span>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="qr-label__logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <span
            className={
              longName ? "qr-label__name qr-label__name--long" : "qr-label__name"
            }
          >
            {name || "-"}
          </span>
        </div>
        <div className="qr-label__right">
          {qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt={`QR ${code}`} className="qr-label__qr" />
          ) : (
            <span className="block break-all px-1 text-[8px] text-slate-500">
              {qrContent || code}
            </span>
          )}
          <span className="qr-label__code">{code}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Pratinjau + cetak label QR satu aset. Isolasi cetak lewat portal
 * `#qr-print-root` di <body> (CSS di globals.css) → tidak ada halaman kosong.
 */
export function QrPrintModal({
  assetCode,
  onClose,
}: {
  assetCode: string;
  onClose: () => void;
}) {
  const open = Boolean(assetCode);
  const { data, isLoading, error, refetch } = useQrReport(assetCode);
  const qr = (data?.data ?? undefined) as Record<string, unknown> | undefined;
  const assetObj = (qr?.asset as Record<string, unknown>) ?? {};

  const code = qr ? pick(qr, ["asset_code"]) || pick(assetObj, ["AssetCode"]) : "";
  const name = qr ? pick(qr, ["asset_name"]) || pick(assetObj, ["AssetName"]) : "";
  const qrImage = qr ? pick(qr, ["qr_image"]) : "";
  const logoUrl = qr ? pick(qr, ["logo_url"]) : "";
  const qrContent = qr ? pick(qr, ["qr_content", "qr_payload"]) : "";
  const printUrl = qr ? pick(qr, ["print_url", "qr_url"]) : "";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title="Cetak Label QR"
        description={assetCode}
      >
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !qr ? (
          <ErrorState error={new Error("QR tidak ditemukan untuk aset ini.")} />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="qr-label-scale overflow-hidden rounded-lg ring-1 ring-slate-200">
              <QrLabel
                logoUrl={logoUrl}
                name={name}
                code={code}
                qrImage={qrImage}
                qrContent={qrContent}
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Cetak
              </Button>
              {printUrl ? (
                <a
                  href={printUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  <ExternalLink className="h-4 w-4" />
                  Halaman cetak bawaan
                </a>
              ) : null}
            </div>

            {qrContent ? (
              <p className="max-w-[420px] break-all rounded bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-500">
                Isi QR: {qrContent}
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      {mounted && open && qr
        ? createPortal(
            <div id="qr-print-root">
              <QrLabel
                logoUrl={logoUrl}
                name={name}
                code={code}
                qrImage={qrImage}
                qrContent={qrContent}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
