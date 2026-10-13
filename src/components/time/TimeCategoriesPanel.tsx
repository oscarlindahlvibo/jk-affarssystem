import { useState } from "react";
import { Plus } from "lucide-react";
import { useTimeTracking } from "../../data/timeTracking";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";

export function TimeCategoriesPanel() {
  const { categories, addCategory, updateCategory } = useTimeTracking();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ändringen kunde inte sparas.");
    }
  }

  return (
    <Panel title="Tidskategorier">
      <p className="mb-3 text-xs text-slate-500">
        Kategorierna väljs när personal stämplar in eller registrerar tid (t.ex. Rekning). Dolda kategorier försvinner ur listorna men tidigare registrerad tid ligger kvar.
      </p>
      {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <ul className="divide-y divide-border">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
            <input
              key={`${c.id}-${c.label}`}
              className={`${inputClass} !w-56 ${c.active ? "" : "text-slate-400"}`}
              defaultValue={c.label}
              aria-label={`Namn för ${c.label}`}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== c.label) void run(() => updateCategory(c.id, { label: next }));
                else e.target.value = c.label;
              }}
            />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={c.active} onChange={(e) => void run(() => updateCategory(c.id, { active: e.target.checked }))} />
              Aktiv
            </label>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await addCategory(label);
            setLabel("");
          });
        }}
      >
        <input className={`${inputClass} !w-56`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ny kategori, t.ex. Städning" aria-label="Ny kategori" />
        <Button type="submit" variant="secondary"><Plus size={14} /> Lägg till</Button>
      </form>
    </Panel>
  );
}
