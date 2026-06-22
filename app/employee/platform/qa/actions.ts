"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getTestPlans() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("platform_test_plans")
    .select("*, platform_test_results(*)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createTestPlan(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("platform_test_plans").insert({
    title: String(form.get("title")),
    status: "draft",
    created_by: user?.id ?? null,
  });
  revalidatePath("/employee/platform/qa");
}

export async function addTestResult(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  const planId = String(form.get("test_plan_id"));
  await supabase.from("platform_test_results").insert({
    test_plan_id: planId,
    scenario: String(form.get("scenario")),
    acceptance_criteria: form.get("acceptance_criteria") ? String(form.get("acceptance_criteria")) : null,
    result: "pending",
    tested_by: user?.id ?? null,
  });
  revalidatePath("/employee/platform/qa");
}

export async function updateTestResult(id: string, result: string) {
  const supabase = await requireClient();
  await supabase.from("platform_test_results").update({
    result,
    tested_at: new Date().toISOString(),
  }).eq("id", id);
  revalidatePath("/employee/platform/qa");
}

export async function updateTestPlanStatus(id: string, status: string) {
  const supabase = await requireClient();
  await supabase.from("platform_test_plans").update({ status }).eq("id", id);
  revalidatePath("/employee/platform/qa");
}
