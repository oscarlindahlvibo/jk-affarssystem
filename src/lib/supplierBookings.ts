import type { SupplierBookingDispatch } from "../types";
import { supabase } from "./supabase";

export interface SupplierBookingSendResult {
  ok: boolean;
  dispatches: SupplierBookingDispatch[];
  message?: string;
}

async function functionError(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      return context.clone().json().then((body) => body?.error || fallback).catch(() => fallback);
    }
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

export async function sendSupplierBookingRequest(projectId: string, supplierIds: string[]): Promise<SupplierBookingSendResult> {
  if (!supabase) throw new Error("Supabase är inte konfigurerat.");
  const { data, error } = await supabase.functions.invoke("send-supplier-booking", {
    body: { project_id: projectId, supplier_ids: supplierIds },
  });
  if (error) throw new Error(await functionError(error, "Bokningen kunde inte skickas."));
  return data as SupplierBookingSendResult;
}
