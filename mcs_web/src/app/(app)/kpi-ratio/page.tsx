"use client";

import { Gauge } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/ui/states";

export default function KpiRatioPage() {
  return (
    <PageContainer title="KPI & Ratio" description="Indikator kinerja dan rasio operasional.">
      <EmptyState
        icon={<Gauge className="h-6 w-6" />}
        title="Segera hadir"
        description="Modul KPI & Ratio sedang disiapkan dan akan tersedia di pembaruan berikutnya."
      />
    </PageContainer>
  );
}
