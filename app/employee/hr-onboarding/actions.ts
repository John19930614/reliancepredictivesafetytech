"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { updateEmployeeOnboardingCompletion } from "@/lib/hr-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getSafeNextPath(value: string) {
  if (!value || !value.startsWith("/employee") || value.startsWith("/employee-login")) {
    return "";
  }

  if (value === "/employee/hr-onboarding" || value.startsWith("/employee/hr-onboarding?")) {
    return "";
  }

  return value;
}

function onboardingPath(params: { error?: string; message?: string; next?: string }) {
  const searchParams = new URLSearchParams();

  if (params.error) {
    searchParams.set("error", params.error);
  }

  if (params.message) {
    searchParams.set("message", params.message);
  }

  const safeNext = getSafeNextPath(params.next ?? "");

  if (safeNext) {
    searchParams.set("next", safeNext);
  }

  const query = searchParams.toString();
  return query ? `/employee/hr-onboarding?${query}` : "/employee/hr-onboarding";
}

async function getSignedInUser() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/employee/hr-onboarding");
  }

  return { supabase, user };
}

function getAdminClientOrRedirect() {
  const admin = createAdminClient();

  if (!admin) {
    redirect("/employee/hr-onboarding?error=Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before saving onboarding.");
  }

  return admin;
}

async function updateProfileCompletion(userId: string) {
  const admin = createAdminClient();

  if (!admin) return null;

  return updateEmployeeOnboardingCompletion(admin, userId);
}

export async function saveEmployeeProfile(formData: FormData) {
  const { user } = await getSignedInUser();
  const admin = getAdminClientOrRedirect();
  const legalName = cleanText(formData.get("legal_name"));
  const next = cleanText(formData.get("next"));

  if (!legalName) {
    redirect(onboardingPath({ error: "Legal name is required.", next }));
  }

  const { error } = await admin.from("employee_profiles").upsert({
    user_id: user.id,
    legal_name: legalName,
    phone: cleanText(formData.get("phone")) || null,
    emergency_contact_name: cleanText(formData.get("emergency_contact_name")) || null,
    emergency_contact_phone: cleanText(formData.get("emergency_contact_phone")) || null,
    emergency_contact_relationship: cleanText(formData.get("emergency_contact_relationship")) || null,
    onboarding_status: "in_progress",
  });

  if (error) {
    redirect(onboardingPath({ error: error.message, next }));
  }

  const completionError = await updateProfileCompletion(user.id);

  if (completionError) {
    redirect(onboardingPath({ error: completionError.message, next }));
  }

  revalidatePath("/employee/hr-onboarding");
  redirect(onboardingPath({ message: "Profile saved.", next }));
}

export async function signEmployeeDocument(formData: FormData) {
  const { supabase, user } = await getSignedInUser();
  const admin = getAdminClientOrRedirect();
  const assignmentId = cleanText(formData.get("assignment_id"));
  const typedLegalName = cleanText(formData.get("typed_legal_name"));
  const consented = formData.get("consented") === "on";
  const next = cleanText(formData.get("next"));

  if (!assignmentId || !typedLegalName || !consented) {
    redirect(onboardingPath({ error: "Type your legal name and check consent before signing.", next }));
  }

  const { data: profile } = await supabase
    .from("employee_profiles")
    .select("legal_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.legal_name) {
    redirect(onboardingPath({ error: "Save your legal name before signing documents.", next }));
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("employee_document_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    redirect(onboardingPath({ error: assignmentError?.message ?? "Document assignment was not found.", next }));
  }

  if (assignment.status !== "pending") {
    redirect(onboardingPath({ error: "This document has already been completed.", next }));
  }

  const { data: template, error: templateError } = await supabase
    .from("hr_document_templates")
    .select("*")
    .eq("id", assignment.template_id)
    .maybeSingle();

  if (templateError || !template) {
    redirect(onboardingPath({ error: templateError?.message ?? "Document template was not found.", next }));
  }

  const { data: sourceDocument } = template.source_document_id
    ? await supabase
        .from("company_documents")
        .select("id, file_path")
        .eq("id", template.source_document_id)
        .maybeSingle()
    : { data: null };

  const headerStore = await headers();
  const { error: signatureError } = await admin.from("employee_document_signatures").insert({
    assignment_id: assignment.id,
    user_id: user.id,
    template_id: template.id,
    template_version: template.version,
    document_title: template.title,
    document_body: template.body_text,
    source_document_id: template.source_document_id,
    source_file_path: sourceDocument?.file_path ?? null,
    typed_legal_name: typedLegalName,
    consented: true,
    signer_email: user.email ?? null,
    signer_ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    signer_user_agent: headerStore.get("user-agent"),
  });

  if (signatureError) {
    redirect(onboardingPath({ error: signatureError.message, next }));
  }

  const signedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("employee_document_assignments")
    .update({ status: "signed", signed_at: signedAt })
    .eq("id", assignment.id)
    .eq("user_id", user.id);

  if (updateError) {
    redirect(onboardingPath({ error: updateError.message, next }));
  }

  const completionError = await updateProfileCompletion(user.id);

  if (completionError) {
    redirect(onboardingPath({ error: completionError.message, next }));
  }

  revalidatePath("/employee/hr-onboarding");
  revalidatePath("/employee/users");
  redirect(onboardingPath({ message: "Document signed.", next }));
}
