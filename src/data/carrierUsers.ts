import { useCallback, useEffect, useState } from "react";
import type { CarrierUser } from "../types";
import { carrierUsers as mockCarrierUsers } from "./mockData";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { inviteCarrierAccount } from "../lib/userInvitations";
import { readJson } from "./workReports";

const KEY = "jk-mock-carrier-users";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

// Hanterar transportörsanvändare för en leverantör (endast admin ser/ändrar dem via RLS).
export function useCarrierUsers(supplierId: string | null, orgId: string) {
  const [users, setUsers] = useState<CarrierUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supplierId) return;
    if (!isSupabaseConfigured || !supabase) {
      setUsers(readJson<CarrierUser[]>(KEY, mockCarrierUsers).filter((u) => u.supplier_id === supplierId));
      return;
    }
    const { data, error: loadError } = await supabase
      .from("carrier_users")
      .select("id, org_id, supplier_id, full_name, email, status, initials, invited_at")
      .eq("supplier_id", supplierId)
      .order("full_name");
    if (loadError) setError(loadError.message);
    else setUsers((data ?? []) as CarrierUser[]);
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = useCallback(
    async (data: { full_name: string; email: string }) => {
      if (!supplierId) return { ok: false as const, reason: "Ingen leverantör vald." };
      setError(null);
      if (isSupabaseConfigured) {
        const result = await inviteCarrierAccount({ supplier_id: supplierId, ...data });
        if (!result.ok) return result;
        setUsers((prev) => [result.user, ...prev]);
        return { ok: true as const };
      }
      const all = readJson<CarrierUser[]>(KEY, mockCarrierUsers);
      if (all.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) return { ok: false as const, reason: "Det finns redan en användare med den e-postadressen." };
      const user: CarrierUser = { id: `ca${Date.now()}`, org_id: orgId, supplier_id: supplierId, ...data, status: "inbjuden", initials: initials(data.full_name), invited_at: new Date().toISOString() };
      window.localStorage.setItem(KEY, JSON.stringify([user, ...all]));
      setUsers((prev) => [user, ...prev]);
      return { ok: true as const };
    },
    [orgId, supplierId]
  );

  const setStatus = useCallback(
    async (id: string, status: CarrierUser["status"]) => {
      setError(null);
      if (isSupabaseConfigured && supabase) {
        const { error: updateError } = await supabase.from("carrier_users").update({ status }).eq("id", id);
        if (updateError) {
          setError(updateError.message);
          return;
        }
      } else {
        const all = readJson<CarrierUser[]>(KEY, mockCarrierUsers);
        window.localStorage.setItem(KEY, JSON.stringify(all.map((u) => (u.id === id ? { ...u, status } : u))));
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    },
    []
  );

  return { users, error, invite, setStatus };
}
