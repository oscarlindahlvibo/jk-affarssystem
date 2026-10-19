import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTimeTracking } from "../../data/timeTracking";
import { formatClock } from "../../lib/format";
import { useNow } from "../time/useNow";

export function ClockChip() {
  const { openEntry } = useTimeTracking();
  const now = useNow(Boolean(openEntry));
  if (!openEntry) return null;
  const onPause = openEntry.entry_type !== "work";
  return (
    <Link
      to="/tid"
      title={onPause ? "Rast på projektklockan – öppna projekttid" : "Projektklockan är igång – öppna projekttid"}
      className={`hidden shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums sm:flex ${onPause ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
    >
      <Clock size={14} />
      {formatClock(now - new Date(openEntry.start_time).getTime())}
    </Link>
  );
}
