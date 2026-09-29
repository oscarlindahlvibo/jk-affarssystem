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
