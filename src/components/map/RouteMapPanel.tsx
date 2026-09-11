import { useState } from "react";
import { X } from "lucide-react";
import type { MeasurementPoint } from "../../types";
import { MEASUREMENT_POINT_DOT, MEASUREMENT_POINT_STYLES } from "../../lib/status";

// Enkel mockad kartpanel: punkter placeras proportionellt utmed en rutlinje.
// Byggd så att `points` senare kan mappas mot riktig geodata (lat/lng) från mätsystemet.
export function RouteMapPanel({ points }: { points: MeasurementPoint[] }) {
  const [selected, setSelected] = useState<MeasurementPoint | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-slate-400">
        Ingen ruttmätning kopplad till projektet ännu.
      </div>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 0.1;

  function project(p: MeasurementPoint) {
    const x = maxLng === minLng ? 50 : ((p.lng - minLng) / (maxLng - minLng)) * (100 - pad * 200) + pad * 100;
    const y = maxLat === minLat ? 50 : (1 - (p.lat - minLat) / (maxLat - minLat)) * (100 - pad * 200) + pad * 100;
    return { x, y };
  }

  const routePoints = points.map(project);
  const pathD = routePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="space-y-3">
      <div className="relative h-72 w-full overflow-hidden rounded-lg border border-border bg-gradient-to-br from-slate-100 to-sky-50">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={pathD} fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="2,1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((point, i) => {
          const { x, y } = routePoints[i];
          return (
            <button
              key={point.id}
              onClick={() => setSelected(point)}
              style={{ left: `${x}%`, top: `${y}%`, backgroundColor: MEASUREMENT_POINT_DOT[point.status] }}
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform hover:scale-125"
              title={point.name}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-600" /> OK</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Bevaka</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Kritisk</span>
        <span className="ml-auto italic">Mockad kartvy – kopplas till riktig kartdata senare</span>
      </div>

      {selected && (
        <div className={`rounded-lg border p-4 ${MEASUREMENT_POINT_STYLES[selected.status]}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold">{selected.name}</div>
              <div className="text-xs opacity-80">Mätkvalitet: {selected.quality}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="status-pill bg-white/60">{selected.status}</span>
              <button onClick={() => setSelected(null)} className="rounded p-0.5 hover:bg-white/50">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs opacity-70">Fri höjd</div>
              <div className="font-medium">{selected.free_height ?? "–"} m</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Transporthöjd</div>
              <div className="font-medium">{selected.transport_height ?? "–"} m</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Marginal</div>
              <div className="font-medium">{selected.margin ?? "–"} m</div>
            </div>
          </div>
          {selected.comment && <p className="mt-3 text-sm opacity-90">{selected.comment}</p>}
        </div>
      )}
    </div>
  );
}
