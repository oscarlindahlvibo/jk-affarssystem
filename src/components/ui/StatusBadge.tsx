import type { ProjectStatus } from "../../types";
import { STATUS_STYLES } from "../../lib/status";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status-pill ${STATUS_STYLES[status]}`}>{status}</span>;
}
