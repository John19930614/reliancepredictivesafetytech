"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assignActiveRequiredHrDocuments } from "@/lib/hr-onboarding";
import { requiredHrDocumentTemplates } from "@/lib/hr-document-templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

function hrDocumentsPath(params: Record<string, string>) {
  return `/employee/hr-documents?${new URLSearchParams(params).toString()}`;
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

const requiredTemplateFormSlugs: Record<string, string> = {
  "Federal Form I-9 Employment Eligibility Checklist": "federal-i9-section-1",
  "Federal Form W-4 Employee Withholding Checklist": "federal-w4-employee-withholding",
  "Texas New Hire Reporting Worksheet": "texas-new-hire-reporting",
  "Employee Personal Information and Emergency Contact Form": "employee-profile-emergency-contact",
  "Offer and Role Acknowledgment": "offer-role-acknowledgment",
  "Direct Deposit Authorization": "direct-deposit-authorization",
  "Employee Handbook Acknowledgment": "employee-handbook-acknowledgment",
  "Confidentiality and IP Assignment Agreement": "confidentiality-ip-assignment",
  "Acceptable Use and Information Security Policy": "acceptable-use-information-security",
  "Safety-Critical Data and AI Output Acknowledgment": "safety-ai-output-acknowledgment",
  "Employee Privacy and Data Handling Acknowledgment": "employee-privacy-data-handling",
  "Electronic Records and E-Sign Consent": "electronic-records-esign-consent",
};

async function getAuthorizedAdmin() {
  const supabase = await createClient();

  if (!supabase) {
    redirect(hrDocumentsPath({ error: "Supabase is not configured yet." }));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/employee/hr-documents");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!role || role.account_status !== "active" || !isPortalAdminRole(role.role)) {
    redirect(hrDocumentsPath({ error: "Only portal admins can manage HR document templates." }));
  }

  return user;
}

function getAdminClientOrRedirect() {
  const admin = createAdminClient();

  if (!admin) {
    redirect(hrDocumentsPath({ error: "Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before managing HR documents." }));
  }

  return admin;
}

async function relinkRequiredTemplatesToFillableForms(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const slugs = Object.values(requiredTemplateFormSlugs);
  const { data: definitions, error } = await admin.from("hr_form_definitions").select("id, slug").in("slug", slugs);

  if (error) {
    return error;
  }

  const definitionsBySlug = new Map((definitions ?? []).map((definition) => [definition.slug, definition.id]));

  for (const [title, slug] of Object.entries(requiredTemplateFormSlugs)) {
    const formDefinitionId = definitionsBySlug.get(slug);
    if (!formDefinitionId) {
      continue;
    }

    const { error: updateError } = await admin
      .from("hr_document_templates")
      .update({ form_definition_id: formDefinitionId })
      .eq("title", title);

    if (updateError) {
      return updateError;
    }
  }

  return null;
}

export async function createHrDocumentTemplate(formData: FormData) {
  await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const title = cleanText(formData.get("title"));
  const bodyText = cleanText(formData.get("body_text"));
  const version = Number(cleanText(formData.get("version")) || "1");
  const sortOrder = Number(cleanText(formData.get("sort_order")) || "100");

  if (!title || !bodyText) {
    redirect(hrDocumentsPath({ error: "Title and document body are required." }));
  }

  const { error } = await admin.from("hr_document_templates").insert({
    title,
    category: cleanText(formData.get("category")) || "People / HR",
    body_text: bodyText,
    version: Number.isFinite(version) ? version : 1,
    active: formData.get("active") === "on",
    required: formData.get("required") === "on",
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
    source_document_id: cleanText(formData.get("source_document_id")) || null,
  });

  if (error) {
    redirect(hrDocumentsPath({ error: error.message }));
  }

  const linkError = await relinkRequiredTemplatesToFillableForms(admin);

  if (linkError) {
    redirect(hrDocumentsPath({ error: linkError.message }));
  }

  revalidatePath("/employee/hr-documents");
  redirect(hrDocumentsPath({ message: "HR document template created." }));
}

export async function upsertRequiredHrDocumentTemplates() {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();

  const { error } = await admin.from("hr_document_templates").upsert(
    requiredHrDocumentTemplates.map((template) => ({
      title: template.title,
      category: template.category,
      body_text: template.bodyText,
      version: template.version,
      active: template.active,
      required: template.required,
      sort_order: template.sortOrder,
      source_document_id: null,
    })),
    { onConflict: "title,version" },
  );

  if (error) {
    redirect(hrDocumentsPath({ error: error.message }));
  }

  const linkError = await relinkRequiredTemplatesToFillableForms(admin);

  if (linkError) {
    redirect(hrDocumentsPath({ error: linkError.message }));
  }

  const { data: profiles, error: profilesError } = await admin
    .from("employee_profiles")
    .select("user_id")
    .eq("profile_status", "active");

  if (profilesError) {
    redirect(hrDocumentsPath({ error: profilesError.message }));
  }

  const assignmentError = await assignActiveRequiredHrDocuments(
    admin,
    (profiles ?? []).map((profile) => profile.user_id),
    currentUser.id,
  );

  if (assignmentError) {
    redirect(hrDocumentsPath({ error: assignmentError.message }));
  }

  revalidatePath("/employee/hr-documents");
  revalidatePath("/employee/hr-onboarding");
  revalidatePath("/employee/users");
  redirect(hrDocumentsPath({ message: "Required HR forms installed and assigned to active employees." }));
}

export async function updateHrDocumentTemplate(formData: FormData) {
  await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const templateId = cleanText(formData.get("template_id"));
  const title = cleanText(formData.get("title"));
  const bodyText = cleanText(formData.get("body_text"));
  const version = Number(cleanText(formData.get("version")) || "1");
  const sortOrder = Number(cleanText(formData.get("sort_order")) || "100");

  if (!templateId || !title || !bodyText) {
    redirect(hrDocumentsPath({ error: "Template, title, and document body are required." }));
  }

  const { error } = await admin
    .from("hr_document_templates")
    .update({
      title,
      category: cleanText(formData.get("category")) || "People / HR",
      body_text: bodyText,
      version: Number.isFinite(version) ? version : 1,
      active: formData.get("active") === "on",
      required: formData.get("required") === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      source_document_id: cleanText(formData.get("source_document_id")) || null,
    })
    .eq("id", templateId);

  if (error) {
    redirect(hrDocumentsPath({ error: error.message }));
  }

  revalidatePath("/employee/hr-documents");
  revalidatePath("/employee/hr-onboarding");
  redirect(hrDocumentsPath({ message: "HR document template updated." }));
}
