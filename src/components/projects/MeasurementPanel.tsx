import { ExternalLink, Ruler } from "lucide-react";
import type { MeasurementLink } from "../../types";
import { Panel } from "../ui/Panel";
import { RouteMapPanel } from "../map/RouteMapPanel";
import { getMeasurementPoints } from "../../data/mockData";
import { formatDate } from "../../lib/format";

const STATUS_COLORS: Record<string, string> = {
  "Klar": "bg-green-100 text-green-700",
  "Pågående": "bg-orange-100 text-orange-700",
  "Bevakning": "bg-amber-100 text-amber-700",
  "Ej startad": "bg-slate-100 text-slate-600",
};

export function MeasurementPanel({ link }: { link: MeasurementLink | null | undefined }) {
  if (!link) {
    return (
      <Panel title="Kopplad ruttmätning">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-slate-400">
          <Ruler size={22} />
          Ingen ruttmätning kopplad till projektet ännu.
          <span className="text-xs">Koppling till mätsystemet sker automatiskt när en rutt har mätts in.</span>
        </div>
      </Panel>
    );
  }

  const points = getMeasurementPoints(link.id);

  return (
    <Panel
      title="Kopplad ruttmätning"
      action={
        link.link_to_measurement_map && (
          <a
            href={link.link_to_measurement_map}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800"
          >
            Öppna i mätsystemet <ExternalLink size={12} />
          </a>
        )
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-500">Datum för mätning</div>
          <div className="text-sm font-medium text-slate-800">{formatDate(link.measurement_date)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Antal mätpunkter</div>
          <div className="text-sm font-medium text-slate-800">{link.number_of_measurement_points ?? "–"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Status</div>
          <span className={`status-pill ${STATUS_COLORS[link.measurement_status]}`}>{link.measurement_status}</span>
        </div>
        <div>
          <div className="text-xs text-slate-500">Lägsta fria höjd</div>
          <div className="text-sm font-medium text-slate-800">{link.lowest_measured_height ?? "–"} m</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Transporthöjd</div>
          <div className="text-sm font-medium text-slate-800">{link.transport_height ?? "–"} m</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Minsta marginal</div>
          <div className={`text-sm font-medium ${(link.minimum_margin ?? 1) < 0.1 ? "text-red-600" : "text-slate-800"}`}>
            {link.minimum_margin ?? "–"} m
          </div>
        </div>
      </div>

      {link.measurement_summary && (
        <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{link.measurement_summary}</p>
      )}

      <RouteMapPanel points={points} />
    </Panel>
  );
}
