"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface HeaderState {
  title?: string;
  subtitle?: string;
}

interface HeaderContextValue {
  header: HeaderState;
  setHeader: (h: HeaderState) => void;
}

const PageHeaderContext = createContext<HeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = useState<HeaderState>({});
  const setHeader = useCallback((h: HeaderState) => setHeaderState(h), []);
  const value = useMemo(() => ({ header, setHeader }), [header, setHeader]);
  return (
    <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>
  );
}

export function usePageHeader(): HeaderContextValue {
  return (
    useContext(PageHeaderContext) ?? { header: {}, setHeader: () => undefined }
  );
}

/**
 * Dipanggil oleh PageContainer untuk melaporkan judul halaman ke top bar.
 * Hanya menerima string agar dependency effect stabil.
 */
export function useSetPageHeader(title?: string, subtitle?: string): void {
  const { setHeader } = usePageHeader();
  useEffect(() => {
    setHeader({ title, subtitle });
    return () => setHeader({});
  }, [title, subtitle, setHeader]);
}
