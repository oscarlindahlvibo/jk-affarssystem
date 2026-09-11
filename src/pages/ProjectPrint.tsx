import { useParams, Link } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { useStore } from "../data/store";
import { formatDate, formatDateTime } from "../lib/format";

export function ProjectPrint() {
  const { id } = useParams<{ id: string }>();
  const { getProject } = useStore();
  const project = id ? getProject(id) : undefined;

  if (!project) {
    return <div className="p-10 text-center text-slate-500">Projektet hittades inte.</div>;
  }

  const cargo = project.cargo_items?.[0];
  const loading = project.locations?.find((l) => l.type === "lastning");
  const unloading = project.locations?.find((l) => l.type === "lossning");
  const link = project.measurement_link;

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-slate-800 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link to={`/projekt/${project.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600">
          <ArrowLeft size={14} /> Tillbaka till projektet
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Printer size={14} /> Skriv ut / Spara som PDF
        </button>
      </div>

      <div className="mb-8 flex items-start justify-between border-b border-slate-300 pb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">JK Projektlogistik AB</div>
          <h1 className="text-2xl font-bold">{project.project_number}</h1>
          <div className="text-lg text-slate-600">{project.name}</div>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>Status: <span className="font-medium text-slate-800">{project.status}</span></div>
          <div>Utskrivet: {formatDate(new Date().toISOString())}</div>
        </div>
      </div>

      <Section title="Kund och kontakt">
        <Grid>
          <Item label="Kund" value={project.customer?.company_name} />
          <Item label="Org.nr" value={project.customer?.org_number} />
          <Item label="Kontaktperson" value={project.contact_person?.name} />
          <Item label="Telefon" value={project.contact_person?.phone ?? project.contact_person?.mobile} />
          <Item label="E-post" value={project.contact_person?.email} />
          <Item label="Ansvarig hos JK" value={project.responsible?.full_name} />
        </Grid>
      </Section>

      <Section title="Transportdata">
        <Grid>
          <Item label="Lastningsplats" value={loading?.name} />
          <Item label="Lossningsplats" value={unloading?.name} />
          <Item label="Planerat lastningsdatum" value={formatDate(project.planned_loading_date)} />
          <Item label="Planerat leveransdatum" value={formatDate(project.planned_delivery_date)} />
          <Item label="Transporttyp" value={project.transport_type} />
          <Item label="Transportör" value={project.supplier?.company_name} />
        </Grid>
        {project.special_requirements && (
          <p className="mt-3 text-sm"><span className="font-medium">Särskilda krav: </span>{project.special_requirements}</p>
        )}
      </Section>

      <Section title="Gods">
        {cargo ? (
          <Grid>
            <Item label="Beskrivning" value={cargo.description} />
            <Item label="Längd" value={cargo.length_m ? `${cargo.length_m} m` : undefined} />
            <Item label="Bredd" value={cargo.width_m ? `${cargo.width_m} m` : undefined} />
            <Item label="Höjd" value={cargo.height_m ? `${cargo.height_m} m` : undefined} />
            <Item label="Vikt" value={cargo.weight_ton ? `${cargo.weight_ton} ton` : undefined} />
            <Item label="Antal kollin" value={cargo.quantity} />
          </Grid>
        ) : (
          <p className="text-sm text-slate-500">Ingen godsinformation registrerad.</p>
        )}
      </Section>

      {link && (
        <Section title="Kopplad ruttmätning">
          <Grid>
            <Item label="Datum för mätning" value={formatDate(link.measurement_date)} />
            <Item label="Antal mätpunkter" value={link.number_of_measurement_points} />
            <Item label="Lägsta fria höjd" value={link.lowest_measured_height ? `${link.lowest_measured_height} m` : undefined} />
            <Item label="Transporthöjd" value={link.transport_height ? `${link.transport_height} m` : undefined} />
            <Item label="Minsta marginal" value={link.minimum_margin !== null ? `${link.minimum_margin} m` : undefined} />
            <Item label="Status" value={link.measurement_status} />
          </Grid>
        </Section>
      )}

      <Section title="Dokument">
        {project.documents && project.documents.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {project.documents.map((d) => (
              <li key={d.id}>{d.file_name} ({d.category})</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Inga dokument.</p>
        )}
      </Section>

      <Section title="Uppgifter">
        {project.tasks && project.tasks.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {project.tasks.map((t) => (
              <li key={t.id}>{t.task} — {t.status}{t.assignee ? ` (${t.assignee})` : ""}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Inga uppgifter.</p>
        )}
      </Section>

      <Section title="Anteckningar">
        {project.notes && project.notes.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {project.notes.map((n) => (
              <li key={n.id}>
                <span className="text-slate-400">{formatDateTime(n.date)} · {n.user_name}:</span> {n.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Inga anteckningar.</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">{children}</div>;
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-medium">{value ?? "–"}</div>
    </div>
  );
}
