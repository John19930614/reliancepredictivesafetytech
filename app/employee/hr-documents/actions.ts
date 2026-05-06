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

const maxSigningSourceUploadBytes = 10 * 1024 * 1024;
const allowedSigningSourceTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const requiredTemplateFormSlugs: Record<string, string> = {
  "Federal Form I-9 Employment Eligibility Checklist": "federal-i9-section-1",
  "Federal Form W-4 Employee Withholding Checklist": "federal-w4-employee-withholding",
  "Texas New Hire Reporting Worksheet": "texas-new-hire-reporting",
  "Employee Personal Information and Emergency Contact Form": "employee-profile-emergency-contact",
  "Offer and Role Acknowledgment": "offer-role-acknowledgment",
  "Direct Deposit Authorization": "direct-deposit-authorization",
  "Confidentiality and IP Assignment Agreement": "confidentiality-ip-assignment",
  "Acceptable Use and Information Security Policy": "acceptable-use-information-security",
  "Safety-Critical Data and AI Output Acknowledgment": "safety-ai-output-acknowledgment",
  "Employee Privacy and Data Handling Acknowledgment": "employee-privacy-data-handling",
  "Electronic Records and E-Sign Consent": "electronic-records-esign-consent",
};

const requiredTemplateRequirementSlugs: Record<string, string> = {
  "Federal Form I-9 Employment Eligibility Checklist": "federal-i9-section-1",
  "I-9 Identity and Work Authorization Document Review Upload": "federal-i9-identity-document-upload",
  "Federal Form W-4 Employee Withholding Checklist": "federal-w4-employee-withholding",
  "Texas New Hire Reporting Worksheet": "texas-new-hire-reporting",
  "Employee Personal Information and Emergency Contact Form": "employee-profile-emergency-contact",
  "Offer and Role Acknowledgment": "offer-role-acknowledgment",
  "Direct Deposit Authorization": "direct-deposit-authorization",
  "Confidentiality and IP Assignment Agreement": "confidentiality-ip-assignment",
  "Acceptable Use and Information Security Policy": "acceptable-use-information-security",
  "Safety-Critical Data and AI Output Acknowledgment": "safety-ai-output-acknowledgment",
  "Employee Privacy and Data Handling Acknowledgment": "employee-privacy-data-handling",
  "Electronic Records and E-Sign Consent": "electronic-records-esign-consent",
  "Payroll, Benefits, and Required Document Upload Checklist": "payroll-benefits-required-upload-checklist",
};

const duplicateOnboardingTemplateTitles = [
  "Offer / Role Acknowledgment",
  "Employee Handbook Acknowledgment",
  "Confidentiality / IP Assignment",
  "Acceptable Use Policy",
  "Safety / Data Policy Acknowledgment",
  "AI Output Disclaimer",
  "Privacy Acknowledgment",
  "E-Sign Consent",
  "Emergency Contact Form",
  "Tax / Payroll Upload Checklist",
];

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

async function uploadHrSigningSourceDocument(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  currentUserId: string,
  formData: FormData,
  values: { title: string; category: string },
) {
  const file = formData.get("source_file");

  if (!(file instanceof File) || !file.name) {
    return null;
  }

  if (file.size > maxSigningSourceUploadBytes) {
    redirect(hrDocumentsPath({ error: "Source document upload is too large. Use a file under 10 MB." }));
  }

  if (!allowedSigningSourceTypes.has(file.type)) {
    redirect(hrDocumentsPath({ error: "Only PDF, DOC, DOCX, JPG, and PNG source files are allowed for signing templates." }));
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filePath = `${currentUserId}/hr-signing-sources/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("company-documents").upload(filePath, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    redirect(hrDocumentsPath({ error: uploadError.message }));
  }

  const { data: document, error: documentError } = await admin
    .from("company_documents")
    .insert({
      title: `${values.title} source file`,
      category: values.category || "People / HR",
      record_type: "Master Template",
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      status: "Uploaded",
      owner: "HR / Onboarding",
      revision: "1.0",
      notes: "Uploaded from the HR signing packet setup before employee signing.",
      uploaded_by: currentUserId,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    redirect(hrDocumentsPath({ error: documentError?.message ?? "Could not register source document upload." }));
  }

  return document.id;
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

async function relinkRequiredTemplatesToComplianceRequirements(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const slugs = Object.values(requiredTemplateRequirementSlugs);
  const { data: requirements, error } = await admin.from("hr_compliance_requirements").select("id, slug").in("slug", slugs);

  if (error) {
    return error;
  }

  const requirementsBySlug = new Map((requirements ?? []).map((requirement) => [requirement.slug, requirement.id]));

  for (const [title, slug] of Object.entries(requiredTemplateRequirementSlugs)) {
    const complianceRequirementId = requirementsBySlug.get(slug);
    if (!complianceRequirementId) {
      continue;
    }

    const { error: updateError } = await admin
      .from("hr_document_templates")
      .update({ compliance_requirement_id: complianceRequirementId })
      .eq("title", title);

    if (updateError) {
      return updateError;
    }
  }

  return null;
}

async function deactivateDuplicateOnboardingTemplates(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: duplicateTemplates, error: templateError } = await admin
    .from("hr_document_templates")
    .select("id")
    .in("title", duplicateOnboardingTemplateTitles);

  if (templateError) {
    return templateError;
  }

  const duplicateTemplateIds = [...new Set((duplicateTemplates ?? []).map((template) => template.id))];

  if (duplicateTemplateIds.length === 0) {
    return null;
  }

  const { error: assignmentError } = await admin
    .from("employee_document_assignments")
    .delete()
    .in("template_id", duplicateTemplateIds)
    .eq("status", "pending");

  if (assignmentError) {
    return assignmentError;
  }

  const { error: deactivateError } = await admin
    .from("hr_document_templates")
    .update({ active: false, required: false })
    .in("id", duplicateTemplateIds);

  return deactivateError;
}

export async function createHrDocumentTemplate(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const title = cleanText(formData.get("title"));
  const bodyText = cleanText(formData.get("body_text"));
  const category = cleanText(formData.get("category")) || "People / HR";
  const version = Number(cleanText(formData.get("version")) || "1");
  const sortOrder = Number(cleanText(formData.get("sort_order")) || "100");

  if (!title || !bodyText) {
    redirect(hrDocumentsPath({ error: "Title and document body are required." }));
  }

  const uploadedSourceDocumentId = await uploadHrSigningSourceDocument(admin, currentUser.id, formData, { title, category });
  const sourceDocumentId = uploadedSourceDocumentId ?? (cleanText(formData.get("source_document_id")) || null);

  const { error } = await admin.from("hr_document_templates").insert({
    title,
    category,
    body_text: bodyText,
    version: Number.isFinite(version) ? version : 1,
    active: formData.get("active") === "on",
    required: formData.get("required") === "on",
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
    source_document_id: sourceDocumentId,
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

  const requirementLinkError = await relinkRequiredTemplatesToComplianceRequirements(admin);

  if (requirementLinkError) {
    redirect(hrDocumentsPath({ error: requirementLinkError.message }));
  }

  const duplicateCleanupError = await deactivateDuplicateOnboardingTemplates(admin);

  if (duplicateCleanupError) {
    redirect(hrDocumentsPath({ error: duplicateCleanupError.message }));
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
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const templateId = cleanText(formData.get("template_id"));
  const title = cleanText(formData.get("title"));
  const bodyText = cleanText(formData.get("body_text"));
  const category = cleanText(formData.get("category")) || "People / HR";
  const version = Number(cleanText(formData.get("version")) || "1");
  const sortOrder = Number(cleanText(formData.get("sort_order")) || "100");

  if (!templateId || !title || !bodyText) {
    redirect(hrDocumentsPath({ error: "Template, title, and document body are required." }));
  }

  const uploadedSourceDocumentId = await uploadHrSigningSourceDocument(admin, currentUser.id, formData, { title, category });
  const sourceDocumentId = uploadedSourceDocumentId ?? (cleanText(formData.get("source_document_id")) || null);

  const { error } = await admin
    .from("hr_document_templates")
    .update({
      title,
      category,
      body_text: bodyText,
      version: Number.isFinite(version) ? version : 1,
      active: formData.get("active") === "on",
      required: formData.get("required") === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      source_document_id: sourceDocumentId,
    })
    .eq("id", templateId);

  if (error) {
    redirect(hrDocumentsPath({ error: error.message }));
  }

  revalidatePath("/employee/hr-documents");
  revalidatePath("/employee/hr-onboarding");
  redirect(hrDocumentsPath({ message: "HR document template updated." }));
}
