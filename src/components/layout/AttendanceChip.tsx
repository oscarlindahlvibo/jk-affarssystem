import { Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { useAttendance } from "../../data/attendance";
import { formatClock } from "../../lib/format";
import { useNow } from "../time/useNow";

// Visar alltid personens stämpelstatus (lönegrundande arbetstid), även på mobil.
export function AttendanceChip() {
  const { openEntry, actor } = useAttendance();
  const now = useNow(Boolean(openEntry));
  if (!actor) return null;
  const onPause = openEntry && openEntry.entry_type !== "work";
  const style = !openEntry ? "bg-slate-100 text-slate-600" : onPause ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800";
  return (
    <Link to="/stampelklocka" title="Öppna stämpelklockan" className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums ${style}`}>
      <Timer size={14} />
      {!openEntry ? "Ej instämplad" : `${onPause ? (openEntry.entry_type === "lunch" ? "Lunch " : "Rast ") : ""}${formatClock(now - new Date(openEntry.start_time).getTime())}`}
    </Link>
  );
}
