"use client";

import { BookOpen } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/ui/states";

export default function ManualPage() {
  return (
    <PageContainer title="Manual" description="Panduan penggunaan sistem.">
      <EmptyState
        icon={<BookOpen className="h-6 w-6" />}
        title="Segera hadir"
        description="Manual pengguna sedang disiapkan dan akan tersedia di pembaruan berikutnya."
      />
    </PageContainer>
  );
}
