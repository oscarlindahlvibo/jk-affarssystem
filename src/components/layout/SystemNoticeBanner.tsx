import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, Info, X } from "lucide-react";
import {
  dismissKey, fetchSystemNotices, formatEventWindow, readDismissed, visibleNotices, writeDismissed,
  type NoticeSeverity, type SystemNotice,
} from "../../lib/systemNotices";

const REFRESH_MS = 5 * 60_000;

const STYLES: Record<NoticeSeverity, { box: string; Icon: typeof Info }> = {
  critical: { box: "border-red-300 bg-red-50 text-red-900", Icon: AlertOctagon },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", Icon: Info },
};

// Visar driftmeddelanden från Vibogruppen (planerade uppdateringar och serverunderhåll) överst i systemet.
export function SystemNoticeBanner() {
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(() => {
    fetchSystemNotices().then(setNotices).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  // Så att ett meddelande försvinner vid sluttiden även om sidan står öppen.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const shown = visibleNotices(notices, dismissed, now);
  if (shown.length === 0) return null;

  function dismiss(notice: SystemNotice) {
    const next = [...dismissed, dismissKey(notice)];
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="space-y-2 border-b border-border bg-surface px-4 py-2 sm:px-6" aria-label="Driftmeddelanden">
      {shown.map((notice) => {
        const { box, Icon } = STYLES[notice.severity];
        const eventWindow = formatEventWindow(notice.event_starts_at, notice.event_ends_at);
        return (
          <div key={notice.id} className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${box}`} role={notice.severity === "critical" ? "alert" : "status"}>
            <div className="flex min-w-0 items-start gap-2">
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">{notice.title}</p>
                {eventWindow && <p>{notice.kind === "maintenance" ? "Serverunderhåll" : notice.kind === "update" ? "Uppdatering" : "Tidpunkt"}: {eventWindow}</p>}
                {notice.body && <p className="whitespace-pre-line">{notice.body}</p>}
              </div>
            </div>
            {notice.severity !== "critical" && (
              <button type="button" onClick={() => dismiss(notice)} className="shrink-0 rounded p-1 hover:bg-black/5" title="Dölj meddelandet" aria-label="Dölj meddelandet">
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
