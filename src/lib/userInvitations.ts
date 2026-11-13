import type { CarrierUser, CustomerUser, Profile, UserRole } from "../types";
import { supabase } from "./supabase";

type InviteResult<T> = { ok: true; user: T; password?: string } | { ok: false; reason: string };

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
  create_with_password?: boolean;
}): Promise<InviteResult<Profile>> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { account_type: "internal", ...data },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Inbjudan kunde inte skickas.") };
  return { ok: true, user: response.user as Profile, password: typeof response.password === "string" ? response.password : undefined };
}

export async function inviteCustomerAccount(data: {
  customer_id: string;
  contact_person_id: string | null;
  full_name: string;
  email: string;
  create_with_password?: boolean;
}): Promise<InviteResult<CustomerUser>> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { account_type: "customer", ...data },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Inbjudan kunde inte skickas.") };
  return { ok: true, user: response.user as CustomerUser, password: typeof response.password === "string" ? response.password : undefined };
}

export async function inviteCarrierAccount(data: {
  supplier_id: string;
  full_name: string;
  email: string;
}): Promise<InviteResult<CarrierUser>> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { account_type: "carrier", ...data },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Inbjudan kunde inte skickas.") };
  return { ok: true, user: response.user as CarrierUser };
}

export async function resetAccountPassword(
  userId: string,
  mode: "generate" | "email"
): Promise<{ ok: true; password?: string } | { ok: false; reason: string }> {
  if (!supabase) return { ok: false, reason: "Supabase är inte konfigurerat." };
  const { data: response, error } = await supabase.functions.invoke("invite-user", {
    body: { action: "reset_password", user_id: userId, mode },
  });
  if (error) return { ok: false, reason: await invitationError(error, "Åtgärden misslyckades.") };
  return { ok: true, password: typeof response?.password === "string" ? response.password : undefined };
}
