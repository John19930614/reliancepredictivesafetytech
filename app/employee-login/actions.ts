"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/employee");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/employee-login?message=invalid");
  }

  redirect(next.startsWith("/employee") ? next : "/employee");
}

export async function logout() {
  const supabase = await createClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}
