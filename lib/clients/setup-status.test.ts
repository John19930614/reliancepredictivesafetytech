import { describe, expect, it } from "vitest";
import { clientFolderNames } from "./folder-template";
import { clientSetupStatus, missingFolderNames } from "./setup-status";

const allFolders = clientFolderNames.map((name) => ({ name }));

/** Everything present: the banner should have nothing to say. */
function complete() {
  return {
    checklist: { data: [{ id: "a" }] },
    folders: { data: allFolders },
    profile: { data: { client_id: "c" } },
  };
}

describe("missingFolderNames", () => {
  it("finds nothing missing when the full set is there", () => {
    expect(missingFolderNames(allFolders)).toEqual([]);
  });

  it("names every folder a company does not have", () => {
    expect(missingFolderNames([])).toEqual([...clientFolderNames]);
  });

  it("matches case-insensitively, as the sibling-name unique index does", () => {
    // Somebody made "proposals" by hand. Seeding "Proposals" beside it would be
    // rejected by lower(name) uniqueness, and the two would look identical.
    expect(missingFolderNames([{ name: "proposals" }])).not.toContain("Proposals");
  });

  it("ignores rows with no usable name rather than throwing", () => {
    expect(missingFolderNames([{ name: null }, {}])).toEqual([...clientFolderNames]);
  });
});

describe("clientSetupStatus", () => {
  it("reports a fully provisioned company as complete", () => {
    const status = clientSetupStatus(complete());
    expect(status).toEqual({
      needsChecklist: false,
      needsFolders: false,
      needsProfile: false,
      incomplete: false,
    });
  });

  it("flags a company with no checklist — the one that cannot clear a gate", () => {
    const status = clientSetupStatus({ ...complete(), checklist: { data: [] } });
    expect(status.needsChecklist).toBe(true);
    expect(status.incomplete).toBe(true);
  });

  it("flags a partial folder set, not just an empty one", () => {
    const status = clientSetupStatus({ ...complete(), folders: { data: [{ name: "Contracts" }] } });
    expect(status.needsFolders).toBe(true);
  });

  it("flags a company with no profile row", () => {
    const status = clientSetupStatus({ ...complete(), profile: { data: null } });
    expect(status.needsProfile).toBe(true);
  });

  /* ---------------------------------------------------------------------- */
  /* The rule this module exists for                                         */
  /* ---------------------------------------------------------------------- */

  it("does not call the checklist missing when the read failed", () => {
    const status = clientSetupStatus({
      ...complete(),
      checklist: { data: null, error: { code: "42501" } },
    });
    expect(status.needsChecklist).toBe(false);
  });

  it("does not offer to create folders when the folder read failed", () => {
    // Offering here would insert duplicates of folders that are already there.
    const status = clientSetupStatus({
      ...complete(),
      folders: { data: null, error: { message: "network" } },
    });
    expect(status.needsFolders).toBe(false);
  });

  it("does not offer a profile when the profile read failed", () => {
    const status = clientSetupStatus({
      ...complete(),
      profile: { data: null, error: { code: "42501" } },
    });
    expect(status.needsProfile).toBe(false);
  });

  it("stays silent about the profile when the table has not been migrated yet", () => {
    // Nothing can be created, so offering to create it would fail every press.
    const status = clientSetupStatus({
      ...complete(),
      profile: { data: null },
      profileTableMissing: true,
    });
    expect(status.needsProfile).toBe(false);
  });

  it("says nothing at all when every read failed", () => {
    const status = clientSetupStatus({
      checklist: { data: null, error: {} },
      folders: { data: null, error: {} },
      profile: { data: null, error: {} },
    });
    expect(status.incomplete).toBe(false);
  });
});
