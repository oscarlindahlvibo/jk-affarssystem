import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
