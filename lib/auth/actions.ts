"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthActionResult {
  error?: string;
  message?: string;
}

export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const companyName = String(formData.get("companyName") ?? "").trim();

  if (!email || !password || !companyName) {
    return { error: "Please fill in company name, email, and password." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createServerSupabaseClient();
  // company_name lands in auth.users.raw_user_meta_data — the
  // handle_new_user() trigger (see supabase/migrations/0003_tenants.sql)
  // reads it from there to create the tenants row immediately, without
  // depending on the client having an authenticated session yet (it won't,
  // until the confirmation email is clicked).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { company_name: companyName } },
  });

  if (error) return { error: error.message };

  return { message: "Check your email to confirm your account, then log in." };
}

export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter both email and password." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
