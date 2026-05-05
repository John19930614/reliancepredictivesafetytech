"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { generateSignedOnboardingPdf } from "@/lib/hr-signed-pdf";
import { updateEmployeeOnboardingCompletion } from "@/lib/hr-onboarding";
import type { HrFormAnswers, HrFormDefinition, HrFormField, HrDocumentTemplate } from "@/lib/company-data";
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

function getFieldSchema(formDefinition: unknown): HrFormField[] {
  const schema = (formDefinition as HrFormDefinition).field_schema;

  if (!Array.isArray(schema)) {
    return [];
  }

  return schema.filter((field): field is HrFormField => {
    return (
      typeof field === "object" &&
      field !== null &&
      typeof field.name === "string" &&
      typeof field.label === "string" &&
      typeof field.type === "string"
    );
  });
}

function collectStructuredAnswers(formData: FormData, fields: HrFormField[]) {
  const answers: HrFormAnswers = {};

  for (const field of fields) {
    if (field.type === "address") {
      answers[field.name] = {
        line1: cleanText(formData.get(`field__${field.name}__line1`)),
        line2: cleanText(formData.get(`field__${field.name}__line2`)),
        city: cleanText(formData.get(`field__${field.name}__city`)),
        state: cleanText(formData.get(`field__${field.name}__state`)),
        postal_code: cleanText(formData.get(`field__${field.name}__postal_code`)),
      };
      continue;
    }

    if (field.type === "checkbox") {
      answers[field.name] = formData.get(`field__${field.name}`) === "on";
      continue;
    }

    answers[field.name] = cleanText(formData.get(`field__${field.name}`));
  }

  return answers;
}

function getMissingRequiredFields(fields: HrFormField[], answers: HrFormAnswers) {
  return fields
    .filter((field) => {
      if (!field.required) {
        return false;
      }

      const answer = answers[field.name];

      if (field.type === "checkbox") {
        return answer !== true;
      }

      if (field.type === "address") {
        if (!answer || typeof answer !== "object" || typeof answer === "boolean") {
          return true;
        }

        return !answer.line1 || !answer.city || !answer.state || !answer.postal_code;
      }

      return !String(answer ?? "").trim();
    })
    .map((field) => field.label);
}

function buildFormSnapshot(template: HrDocumentTemplate, formDefinition: HrFormDefinition) {
  return {
    template_id: template.id,
    template_title: template.title,
    template_category: template.category,
    template_version: template.version,
    form_definition_id: formDefinition.id,
    form_slug: formDefinition.slug,
    form_title: formDefinition.title,
    jurisdiction_type: formDefinition.jurisdiction_type,
    jurisdiction_code: formDefinition.jurisdiction_code,
    applies_to_state: formDefinition.applies_to_state,
    official_form_name: formDefinition.official_form_name,
    official_form_edition: formDefinition.official_form_edition,
    official_form_expiration_date: formDefinition.official_form_expiration_date,
    form_source_url: formDefinition.form_source_url,
    field_schema: formDefinition.field_schema,
  };
}

async function getStructuredAssignmentContext(assignmentId: string, userId: string, next: string) {
  const admin = getAdminClientOrRedirect();

  const { data: assignment, error: assignmentError } = await admin
    .from("employee_document_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    redirect(onboardingPath({ error: assignmentError?.message ?? "Document assignment was not found.", next }));
  }

  if (assignment.status !== "pending") {
    redirect(onboardingPath({ error: "This document has already been completed.", next }));
  }

  const { data: template, error: templateError } = await admin
    .from("hr_document_templates")
    .select("*")
    .eq("id", assignment.template_id)
    .maybeSingle();

  if (templateError || !template) {
    redirect(onboardingPath({ error: templateError?.message ?? "Document template was not found.", next }));
  }

  if (!template.form_definition_id) {
    redirect(onboardingPath({ error: "This document is not configured as a fillable form yet.", next }));
  }

  const { data: formDefinition, error: formError } = await admin
    .from("hr_form_definitions")
    .select("*")
    .eq("id", template.form_definition_id)
    .maybeSingle();

  if (formError || !formDefinition) {
    redirect(onboardingPath({ error: formError?.message ?? "Fillable form definition was not found.", next }));
  }

  return {
    admin,
    assignment,
    template: template as HrDocumentTemplate,
    formDefinition: formDefinition as HrFormDefinition,
    fields: getFieldSchema(formDefinition),
  };
}

async function addAuditEvent(values: {
  assignmentId: string;
  userId: string;
  actorUserId: string;
  eventType: string;
  eventDetails?: Record<string, unknown>;
  signerIp?: string | null;
  signerUserAgent?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin.from("employee_onboarding_audit_events").insert({
    assignment_id: values.assignmentId,
    user_id: values.userId,
    actor_user_id: values.actorUserId,
    event_type: values.eventType,
    event_details: values.eventDetails ?? {},
    signer_ip: values.signerIp ?? null,
    signer_user_agent: values.signerUserAgent ?? null,
  });
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

export async function saveEmployeeFormDraft(formData: FormData) {
  const { user } = await getSignedInUser();
  const assignmentId = cleanText(formData.get("assignment_id"));
  const next = cleanText(formData.get("next"));

  if (!assignmentId) {
    redirect(onboardingPath({ error: "Choose a form before saving.", next }));
  }

  const { admin, assignment, template, formDefinition, fields } = await getStructuredAssignmentContext(assignmentId, user.id, next);
  const answers = collectStructuredAnswers(formData, fields);
  const formSnapshot = buildFormSnapshot(template, formDefinition);

  const { error } = await admin.from("employee_form_responses").upsert(
    {
      assignment_id: assignment.id,
      user_id: user.id,
      template_id: template.id,
      form_definition_id: formDefinition.id,
      status: "draft",
      answers,
      form_version: template.version,
      form_snapshot: formSnapshot,
    },
    { onConflict: "assignment_id" },
  );

  if (error) {
    redirect(onboardingPath({ error: error.message, next }));
  }

  await addAuditEvent({
    assignmentId: assignment.id,
    userId: user.id,
    actorUserId: user.id,
    eventType: "draft_saved",
    eventDetails: { form_slug: formDefinition.slug, field_count: fields.length },
  });

  revalidatePath("/employee/hr-onboarding");
  redirect(onboardingPath({ message: "Form draft saved.", next }));
}

export async function signEmployeeStructuredForm(formData: FormData) {
  const { supabase, user } = await getSignedInUser();
  const assignmentId = cleanText(formData.get("assignment_id"));
  const typedLegalName = cleanText(formData.get("typed_legal_name"));
  const consented = formData.get("consented") === "on";
  const next = cleanText(formData.get("next"));

  if (!assignmentId || !typedLegalName || !consented) {
    redirect(onboardingPath({ error: "Complete the form, type your legal name, and check consent before signing.", next }));
  }

  const { data: profile } = await supabase
    .from("employee_profiles")
    .select("legal_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.legal_name) {
    redirect(onboardingPath({ error: "Save your legal name before signing forms.", next }));
  }

  const { admin, assignment, template, formDefinition, fields } = await getStructuredAssignmentContext(assignmentId, user.id, next);
  const answers = collectStructuredAnswers(formData, fields);
  const missingFields = getMissingRequiredFields(fields, answers);

  if (missingFields.length > 0) {
    redirect(onboardingPath({ error: `Complete required fields: ${missingFields.slice(0, 5).join(", ")}.`, next }));
  }

  const headerStore = await headers();
  const signerIp = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const signerUserAgent = headerStore.get("user-agent");
  const signedAt = new Date().toISOString();
  const formSnapshot = buildFormSnapshot(template, formDefinition);

  const { data: response, error: responseError } = await admin
    .from("employee_form_responses")
    .upsert(
      {
        assignment_id: assignment.id,
        user_id: user.id,
        template_id: template.id,
        form_definition_id: formDefinition.id,
        status: "signed",
        answers,
        form_version: template.version,
        form_snapshot: formSnapshot,
        signed_at: signedAt,
      },
      { onConflict: "assignment_id" },
    )
    .select("*")
    .single();

  if (responseError || !response) {
    redirect(onboardingPath({ error: responseError?.message ?? "Could not save the signed form response.", next }));
  }

  const { bytes, sha256 } = await generateSignedOnboardingPdf({
    template,
    formDefinition,
    answers,
    typedLegalName,
    signerEmail: user.email ?? null,
    signerIp,
    signedAt,
  });
  const fileName = `${formDefinition.slug}-${assignment.id}.pdf`;
  const filePath = `employee-onboarding/${user.id}/${assignment.id}/${fileName}`;
  const { error: uploadError } = await admin.storage.from("employee-onboarding-documents").upload(filePath, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (uploadError) {
    redirect(onboardingPath({ error: uploadError.message, next }));
  }

  const { error: signedDocumentError } = await admin.from("employee_signed_documents").upsert(
    {
      assignment_id: assignment.id,
      response_id: response.id,
      user_id: user.id,
      template_id: template.id,
      form_definition_id: formDefinition.id,
      file_bucket: "employee-onboarding-documents",
      file_path: filePath,
      file_name: fileName,
      file_type: "application/pdf",
      file_sha256: sha256,
      form_snapshot: formSnapshot,
      answer_snapshot: answers,
      typed_legal_name: typedLegalName,
      signer_email: user.email ?? null,
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      signed_at: signedAt,
    },
    { onConflict: "assignment_id" },
  );

  if (signedDocumentError) {
    redirect(onboardingPath({ error: signedDocumentError.message, next }));
  }

  const { error: signatureError } = await admin.from("employee_document_signatures").upsert(
    {
      assignment_id: assignment.id,
      user_id: user.id,
      template_id: template.id,
      template_version: template.version,
      document_title: template.title,
      document_body: `${formDefinition.title} structured form response. Signed PDF and answer snapshot are stored in the restricted employee onboarding records.`,
      source_document_id: template.source_document_id,
      source_file_path: filePath,
      typed_legal_name: typedLegalName,
      consented: true,
      signer_email: user.email ?? null,
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      signed_at: signedAt,
    },
    { onConflict: "assignment_id" },
  );

  if (signatureError) {
    redirect(onboardingPath({ error: signatureError.message, next }));
  }

  const { error: updateError } = await admin
    .from("employee_document_assignments")
    .update({ status: "signed", signed_at: signedAt })
    .eq("id", assignment.id)
    .eq("user_id", user.id);

  if (updateError) {
    redirect(onboardingPath({ error: updateError.message, next }));
  }

  await addAuditEvent({
    assignmentId: assignment.id,
    userId: user.id,
    actorUserId: user.id,
    eventType: "form_signed",
    eventDetails: { form_slug: formDefinition.slug, file_path: filePath, file_sha256: sha256 },
    signerIp,
    signerUserAgent,
  });

  await addAuditEvent({
    assignmentId: assignment.id,
    userId: user.id,
    actorUserId: user.id,
    eventType: "pdf_generated",
    eventDetails: { file_bucket: "employee-onboarding-documents", file_path: filePath, file_sha256: sha256 },
    signerIp,
    signerUserAgent,
  });

  const completionError = await updateProfileCompletion(user.id);

  if (completionError) {
    redirect(onboardingPath({ error: completionError.message, next }));
  }

  revalidatePath("/employee/hr-onboarding");
  revalidatePath("/employee/users");
  redirect(onboardingPath({ message: "Form signed and PDF record saved.", next }));
}
