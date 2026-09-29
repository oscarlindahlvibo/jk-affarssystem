import type { CustomerUser, Profile, UserRole } from "../types";
import { supabase } from "./supabase";

type InviteResult<T> = { ok: true; user: T } | { ok: false; reason: string };

function invitationError(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      return context
        .clone()
        .json()
        .then((body) => (typeof body?.error === "string" ? body.error : fallback))
        .catch(() => fallback);
    }
    if ("message" in error && typeof error.message === "string") return Promise.resolve(error.message);
  }
  return Promise.resolve(fallback);
}

export async function invitePersonnelAccount(data: {
  full_name: string;
  email: string;
  role: UserRole;
}): Promise<InviteResult<Profile>> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { account_type: "internal", ...data },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Inbjudan kunde inte skickas.") };
  return { ok: true, user: response.user as Profile };
}

export async function inviteCustomerAccount(data: {
  customer_id: string;
  contact_person_id: string | null;
  full_name: string;
  email: string;
}): Promise<InviteResult<CustomerUser>> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { account_type: "customer", ...data },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Inbjudan kunde inte skickas.") };
  return { ok: true, user: response.user as CustomerUser };
}
