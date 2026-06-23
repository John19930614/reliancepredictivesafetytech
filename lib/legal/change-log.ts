import "server-only";

export interface RegisterChange {
  entryId: string;
  changeType: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy?: string | null;
  changeReason?: string | null;
}

/**
 * Appends an entry to legal_register_change_log. Best-effort: change logging
 * must never crash the calling mutation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordRegisterChange(supabase: any, change: RegisterChange): Promise<void> {
  try {
    await supabase.from("legal_register_change_log").insert({
      entry_id: change.entryId,
      change_type: change.changeType,
      old_value: change.oldValue ?? null,
      new_value: change.newValue ?? null,
      changed_by: change.changedBy ?? null,
      change_reason: change.changeReason ?? null,
    });
  } catch {
    // swallow — non-critical audit trail
  }
}
