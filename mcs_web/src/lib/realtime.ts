import { API_V2_URL } from "@/lib/env";
import { getToken } from "@/lib/auth";

export interface RealtimeChange {
  id: number;
  topics: string[];
  module?: string;
  wo_number?: string;
  source: string;
}

interface Handlers {
  onChange: (event: RealtimeChange) => void;
  onResync: () => void;
}

const WATCHDOG_MS = 45_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const NO_TOKEN_RETRY_MS = 3_000;

export function startRealtime({ onChange, onResync }: Handlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let hadConnection = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const dispatch = (name: string, data: string) => {
    if (name === "ready") {
      if (hadConnection) onResync();
      hadConnection = true;
      return;
    }
    if (name !== "change") return;
    try {
      const parsed = JSON.parse(data) as RealtimeChange;
      if (Array.isArray(parsed.topics)) onChange(parsed);
    } catch {
      return;
    }
  };

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => controller?.abort(), WATCHDOG_MS);
  };

  const connectOnce = async (): Promise<"retry" | "auth"> => {
    const token = getToken();
    if (!token) return "auth";
    controller = new AbortController();
    try {
      const response = await fetch(`${API_V2_URL}/realtime/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) return "auth";
      if (!response.ok || !response.body) return "retry";

      armWatchdog();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "";
      let data = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armWatchdog();
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index).replace(/\r$/, "");
          buffer = buffer.slice(index + 1);
          if (line === "") {
            if (data) dispatch(eventName, data);
            eventName = "";
            data = "";
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data += (data ? "\n" : "") + line.slice(5).trimStart();
          }
        }
      }
      return "retry";
    } catch {
      return "retry";
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  };

  const loop = async () => {
    let backoff = MIN_BACKOFF_MS;
    while (!stopped) {
      const startedAt = Date.now();
      const result = await connectOnce();
      if (stopped) break;
      if (result === "auth") {
        hadConnection = false;
        await sleep(NO_TOKEN_RETRY_MS);
        continue;
      }
      backoff = Date.now() - startedAt > 20_000 ? MIN_BACKOFF_MS : Math.min(backoff * 2, MAX_BACKOFF_MS);
      await sleep(backoff);
    }
  };

  void loop();

  return () => {
    stopped = true;
    controller?.abort();
    if (watchdog) clearTimeout(watchdog);
  };
}
