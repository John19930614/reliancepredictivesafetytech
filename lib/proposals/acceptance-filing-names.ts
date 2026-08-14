// Names shared between the acceptance filer and the client folder template.
//
// PURE, and separate from acceptance-filing.ts on purpose: that module imports
// "server-only", so anything it exports is unreachable from a client component
// or a pure module. This constant is needed by both sides, so it lives where
// both can reach it.

/**
 * Root-level folder that accepted proposal PDFs are filed into.
 *
 * Two things depend on this string being one string:
 *   - lib/proposals/acceptance-filing.ts creates it lazily on acceptance,
 *     matched case-insensitively;
 *   - lib/clients/folder-template.ts seeds it when the client is created.
 *
 * If those ever spelled it differently, an accepted proposal would mint a
 * second folder beside the seeded one and a client's contracts would split
 * across two places that look identical in the tree.
 */
export const acceptedProposalsFolderName = "Proposals";
