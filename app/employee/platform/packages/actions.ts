"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getVerticalPackages() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("platform_vertical_packages")
    .select("*")
    .order("name");
  return data ?? [];
}

export async function createVerticalPackage(form: FormData) {
  const supabase = await requireClient();
  await supabase.from("platform_vertical_packages").insert({
    name: String(form.get("name")),
    vertical_key: String(form.get("vertical_key")),
    description: form.get("description") ? String(form.get("description")) : null,
    current_version: String(form.get("current_version") ?? "0.1.0"),
    status: "development",
    scenario_test_count: 0,
  });
  revalidatePath("/employee/platform/packages");
}

export async function updatePackageStatus(id: string, status: string) {
  const supabase = await requireClient();
  await supabase.from("platform_vertical_packages").update({ status }).eq("id", id);
  revalidatePath("/employee/platform/packages");
}

export async function updatePackageVersion(id: string, version: string, changelog: string) {
  const supabase = await requireClient();
  await supabase.from("platform_vertical_packages").update({
    current_version: version,
    changelog,
  }).eq("id", id);
  revalidatePath("/employee/platform/packages");
}
