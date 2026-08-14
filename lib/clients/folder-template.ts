// The folders every client gets on day one.
//
// PURE. No I/O — the list and its rules only, so the naming contract below can
// be unit-tested without a database.
//
// WHY A TEMPLATE AT ALL. Before this, a new client's File Center was empty and
// stayed empty until somebody made a folder by hand. Documents therefore landed
// at the scope root, or in whatever one-off folder the first person invented, so
// "where is their signed contract" had a different answer per client.

/**
 * The one name that is NOT free to change.
 *
 * lib/proposals/acceptance-filing.ts lazily creates a folder with this exact
 * name when a proposal is accepted, matched case-insensitively. If the template
 * ever seeded a different spelling, an accepted proposal would mint a SECOND
 * folder beside it and the client's contracts would split across two places.
 *
 * Imported rather than re-typed so the two cannot drift.
 */
import { acceptedProposalsFolderName } from "@/lib/proposals/acceptance-filing-names";

export { acceptedProposalsFolderName };

export interface ClientFolder {
  name: string;
  /** Why it exists, shown as the folder's description where the UI has room. */
  purpose: string;
}

/**
 * Seeded for every new client, in order.
 *
 * Deliberately five and no more. Every empty folder is a small tax on everyone
 * who browses the tree, so this covers the documents the platform's own gates
 * and workflows already care about — and nothing speculative.
 */
export const clientFolderTemplate: readonly ClientFolder[] = [
  {
    // MUST stay exactly this, see above.
    name: acceptedProposalsFolderName,
    purpose: "Proposals sent and accepted. The acceptance filer writes here automatically.",
  },
  {
    name: "Contracts",
    purpose: "Signed MSAs, SOWs and NDAs.",
  },
  {
    name: "Invoices",
    purpose: "Issued invoices and purchase orders.",
  },
  {
    name: "Safety Docs",
    purpose: "Certificates, JSAs, training records and the client's own safety documentation.",
  },
  {
    name: "Onboarding",
    purpose: "Kickoff paperwork and anything the onboarding checklist produces.",
  },
];

/** Folder names only, which is all the provisioning insert needs. */
export const clientFolderNames: readonly string[] = clientFolderTemplate.map((folder) => folder.name);
