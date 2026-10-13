export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "–";
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "–";
}

export function formatDateAndTime(
  date: string | null | undefined,
  time: string | null | undefined
): string {
  const formattedDate = formatDate(date);
  const formattedTime = formatTime(time);
  if (formattedDate === "–") return formattedTime;
  if (formattedTime === "–") return formattedDate;
  return `${formattedDate} kl. ${formattedTime}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined) return "–";
  return `${value}${unit ? " " + unit : ""}`;
}

export function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.round(hours / 24);
  return `${days} dagar sedan`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatClock(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTimeOfDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
