import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MissingField } from "../../lib/validation";

export function MissingFieldsBadge({ missing }: { missing: MissingField[] }) {
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle2 size={13} /> Komplett
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"
      title={`Saknar: ${missing.map((m) => m.label).join(", ")}`}
    >
      <AlertTriangle size={13} /> Saknar {missing.length} uppgift{missing.length > 1 ? "er" : ""}
    </span>
  );
}
