"use client";

/**
 * Vertical / trade pickers for the EHS Talent Engine intake and manage forms.
 *
 * Both render UNCONTROLLED fields so the surrounding forms keep their
 * FormData-based submit handlers:
 *
 *   VerticalChecklist — candidates (many trades per person). Checkboxes named
 *     `verticals_opt` plus an "other" input named `verticals_custom`; read the
 *     result with readVerticalsFromForm().
 *
 *   VerticalDropdown — job orders (a job is one trade). A select named
 *     `vertical_select` plus the same style of custom input named
 *     `vertical_custom`; read with readVerticalFromForm() — typed text wins
 *     over the dropdown so "other" never requires un-picking.
 *
 * The options come from talent_settings.vertical_options (admin-edited in the
 * Money floor panel); values already on the record but no longer in the list
 * are folded in so legacy data stays visible and removable rather than
 * silently vanishing.
 */

import { defaultVerticalOptions, combineVerticalSelection, optionsWithSelection } from "@/lib/talent-engine/verticals";

export function readVerticalsFromForm(data: FormData): string[] {
  return combineVerticalSelection(
    data.getAll("verticals_opt").map((value) => String(value)),
    String(data.get("verticals_custom") ?? ""),
  );
}

export function readVerticalFromForm(data: FormData): string | null {
  const custom = String(data.get("vertical_custom") ?? "").trim();
  const picked = String(data.get("vertical_select") ?? "").trim();
  return custom || picked || null;
}

export function VerticalChecklist({
  options = defaultVerticalOptions as string[],
  selected = [],
  disabled = false,
}: {
  options?: string[];
  selected?: string[];
  disabled?: boolean;
}) {
  const shown = optionsWithSelection(options, selected);
  const checked = new Set(selected.map((value) => value.toLowerCase()));
  return (
    <div className="talent-field talent-field-wide">
      <span>Verticals / trades</span>
      <div className="talent-vertical-grid">
        {shown.map((option) => (
          <label className="talent-vertical-option" key={option}>
            <input
              defaultChecked={checked.has(option.toLowerCase())}
              disabled={disabled}
              name="verticals_opt"
              type="checkbox"
              value={option}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
      <input
        aria-label="Other verticals"
        defaultValue=""
        disabled={disabled}
        maxLength={300}
        name="verticals_custom"
        placeholder="Other (comma-separated)"
      />
    </div>
  );
}

export function VerticalDropdown({
  options = defaultVerticalOptions as string[],
  value = null,
  disabled = false,
}: {
  options?: string[];
  value?: string | null;
  disabled?: boolean;
}) {
  const current = typeof value === "string" ? value.trim() : "";
  const shown = optionsWithSelection(options, current ? [current] : []);
  // A div, not a label: a label may associate with one control and this field
  // carries two (the select and the "other" input).
  return (
    <div className="talent-field">
      <span>Vertical / trade</span>
      <select aria-label="Vertical" defaultValue={current} disabled={disabled} name="vertical_select">
        <option value="">None</option>
        {shown.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <input
        aria-label="Other vertical"
        defaultValue=""
        disabled={disabled}
        maxLength={80}
        name="vertical_custom"
        placeholder="Other (overrides the pick)"
      />
    </div>
  );
}
