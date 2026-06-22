"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getPromptTemplates() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_prompt_templates")
    .select("*")
    .order("category")
    .order("name");
  return data ?? [];
}

export async function getModelRegistry() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_model_registry")
    .select("*")
    .order("status")
    .order("name");
  return data ?? [];
}

export async function getGatewayLog(limit = 50) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_gateway_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getFeedbackEntries(limit = 50) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_feedback_entries")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function createPromptTemplate(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_prompt_templates").insert({
    prompt_key: String(form.get("prompt_key")),
    name: String(form.get("name")),
    category: String(form.get("category") ?? "general"),
    template_text: String(form.get("template_text")),
    description: form.get("description") ? String(form.get("description")) : null,
    confidence_threshold: form.get("confidence_threshold") ? Number(form.get("confidence_threshold")) : 0.70,
    requires_human_review: form.get("requires_human_review") === "on",
    created_by: user?.id ?? null,
  });
  revalidatePath("/employee/platform/ai-services");
}

export async function updateModelStatus(id: string, status: string) {
  const supabase = await requireClient();
  await supabase.from("ai_model_registry").update({ status }).eq("id", id);
  revalidatePath("/employee/platform/ai-services");
}

export async function submitFeedback(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_feedback_entries").insert({
    prompt_key: form.get("prompt_key") ? String(form.get("prompt_key")) : null,
    feedback_type: String(form.get("feedback_type")),
    original_output: form.get("original_output") ? String(form.get("original_output")) : null,
    corrected_output: form.get("corrected_output") ? String(form.get("corrected_output")) : null,
    rejection_reason: form.get("rejection_reason") ? String(form.get("rejection_reason")) : null,
    submitted_by: user?.id ?? null,
    notes: form.get("notes") ? String(form.get("notes")) : null,
  });
  revalidatePath("/employee/platform/ai-services");
}
