import { supabase } from "@/lib/supabase";
import type { ClientCrmContext, Slots } from "./types";

export async function fetchClientContext(clientId: string): Promise<ClientCrmContext | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone, city, electricity_bill, property_type, lead_source, notes, status")
    .eq("id", clientId)
    .single();

  if (error || !data) return null;
  return data as ClientCrmContext;
}

// Opportunistically writes back anything the AI learned this turn, plus an
// optional status/notes update (used when the call ends). Only ever
// touches fields that actually changed — never overwrites known CRM data
// with blanks.
export async function applyCrmUpdates(clientId: string, updates: {
  slots?: Partial<Slots>;
  status?: string;
  notes?: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.slots?.city) patch.city = updates.slots.city;
  if (updates.slots?.electricity_bill) patch.electricity_bill = updates.slots.electricity_bill;
  if (updates.slots?.property_type) patch.property_type = updates.slots.property_type;
  if (updates.status) patch.status = updates.status;
  if (updates.notes) patch.notes = updates.notes;
  if (Object.keys(patch).length === 0) return;

  await supabase.from("clients").update(patch).eq("id", clientId);
}
