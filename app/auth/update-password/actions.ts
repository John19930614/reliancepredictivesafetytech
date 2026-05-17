"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const password = cleanText(formData.get("password"));
  const confirmPassword = cleanText(formData.get("confirm_password"));

  if (password.length < 8) {
    redirect("/auth/update-password?message=short");
  }

  if (password !== confirmPassword) {
    redirect("/auth/update-password?message=mismatch");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?message=password-session-required");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/auth/update-password?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/employee-login?message=password-updated");
}
