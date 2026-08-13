---
name: change
description: Walk a code change through the change-control stages — analyze, plan, classify risk, branch, build, gate, review. Use when starting any non-trivial change to this repo: a feature, bug fix, upgrade, refactor, migration, integration, or UI change. Also use when asked to "follow the SOP" or "run change control" on a piece of work.
---

# Change control

This runs SOP-24 (canonical text: `docs/sop/SOP-24-change-control.md` in the
MACO repo). `CLAUDE.md` in this repo states the *rules*; this skill states the
*order of operations*. Where they conflict, `CLAUDE.md`'s instruction-priority
order wins — security first, then standards, then architecture.

**The rule this skill exists to enforce:** do not edit a file until Stages 1–3
are written out in the conversation. The characteristic AI failure here is a
confident diff built on a misread of the existing system, and Stage 1 catches
that while it is still cheap.

Stages are mandatory. Their *depth* scales with risk. A LOW-risk change can
clear Stages 1–3 in six lines. It cannot clear them in zero.

---

## Stage 1 — Analyze

Read before you plan. Use the file tools; do not answer from memory of similar
codebases. Then write:

```
CURRENT STATE:    what exists today in the area being changed
AFFECTED:         the components/files the change will touch
DEPENDENCIES:     what else consumes these, and could feel the change
RISK AREAS:       what could break that is not obviously related
```

Specific to this repo, check before planning:
- Is there a module catalog entry in `lib/user-management.ts` for the surface
  you are touching, and a nav entry in `components/EmployeeSidebar.tsx`?
- Which `portalUserRoles` may reach this? Never hardcode a role string.
- Does this path go through `lib/ai/gateway.ts`? All AI output entering an
  official workflow must pass `validateAIOutput()`.
- Does the table involved have RLS enabled, and an `updated_at` trigger?

If you cannot fill in `AFFECTED` without guessing, keep reading.

---

## Stage 2 — Plan

Write the contract the diff will later be judged against:

```
OBJECTIVE:        one sentence — what changes for the user
FILES AFFECTED:   expected paths
DATA IMPACT:      tables/columns, or "none"
API IMPACT:       routes added/changed, or "none"
AUTH IMPACT:      auth/permission/RLS surfaces, or "none"
UI IMPACT:        screens, or "none"
TESTS REQUIRED:   per CLAUDE.md's test matrix for this change type
MIGRATION:        migration file + rollback SQL, or "none"
ROLLBACK:         how to undo this if prod breaks
REGRESSION RISK:  what might break that looks unrelated
```

For a **new module**, the plan must also carry the full MODULE SPECIFICATION
CONTRACT from `CLAUDE.md` (MODULE_ID, PURPOSE, ROLES_ALLOWED, GROUP,
PATH_PREFIX, DATA_OBJECTS, WORKFLOW_STATES, ACCEPTANCE_CRITERIA).

"Unknown" on any line means Stage 1 is not finished. Go back.

---

## Stage 3 — Classify risk

State one rating and say why in a sentence.

| Rating | This looks like | Consequence |
|---|---|---|
| **LOW** | Copy, spacing, colors, comments, non-functional polish | Gate only |
| **MODERATE** | New component, widget, filter, form; API change; workflow change | + preview verification |
| **HIGH** | Auth, authorization, schema, billing, roles, deletion, data mutation, AI automation, integrations, env vars, prod config | + full security pass + John approves |
| **CRITICAL** | Dropping DB structures, mass data updates, security architecture, permission model, prod data migration, auth provider, breaking API change | + rollback rehearsed before merge |

Diff size is not risk. A one-line RLS policy edit is CRITICAL.

### Stop and ask John — do not proceed

These are `CLAUDE.md`'s STOP CONDITIONS, and they bind here:

- RLS policies, auth middleware, or role-permission logic
- Dropping or truncating a table or column
- Anything that could expose data across tenant boundaries
- An irreversible migration with no rollback plan
- An env var not present in `.env.example`
- A `supabase/migrations/` file already applied to production
- AI output entering a workflow where `requires_human_review = true`
- A production release without a signed-off test plan

Present the situation and wait. Do not pick the safe-looking interpretation and
continue.

---

## Stage 4 — Branch

Never `main`/`master`. Commit at checkpoints as you go.

---

## Stage 5 — Build

Implement the plan and nothing else.

- Stay inside the declared scope. Unrelated improvements get noted, not made.
- No client-side mutation — use Server Actions (`"use server"`), and
  `revalidatePath()` after them.
- Parameterized Supabase queries only. No raw SQL string concatenation.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only, never in a client component.
- Every API route verifies `supabase.auth.getUser()` first. Cron routes verify
  `CRON_SECRET`; webhook routes verify their webhook secret.
- Destructive or sensitive actions call `recordAuditEvent()` from
  `lib/audit/events.ts`.
- Brand colors via CSS variables (`var(--portal-gold)`), not inline styles.
- New page route gets `error.tsx` if it doesn't inherit one, and a `loading.tsx`
  or Suspense boundary if it fetches async.
- Never weaken or skip a test to make the gate pass. A red test is information.

If the plan turns out wrong mid-build, stop and revise Stage 2, then resume.

---

## Stage 6 — Gate

Run all three. Paste real output; "it should work" is not a result.

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run build
```

`CLAUDE.md`'s test matrix decides what must exist before this is meaningful:
a new module needs unit + RBAC tests; an auth change needs unit + RBAC + E2E;
a migration needs integration + RBAC. Every feature needs at least one positive
and one negative/edge test.

CI runs typecheck, tests, `npm audit --audit-level=high`, a TruffleHog secret
scan, and the build on every push and PR (`.github/workflows/ci.yml`).

---

## Stage 7 — Review the diff

Read the whole diff against the Stage 2 plan. Reconcile every difference.

Hunt for: unplanned files added or deleted · duplicated functionality · dead
code · new dependencies · hardcoded values or magic role strings · stray
`console.log` · debugging scaffolding · TODOs · credentials or env values ·
accidentally committed generated files.

Anything present in the diff but absent from the plan gets **explained or
removed**. Say which, per item.

---

## Stage 8 — Security

Ask how this could be abused, not whether it works. Cover: authn · authz and
role enforcement · tenant isolation · input validation · injection · XSS ·
secrets · uploads and storage permissions · admin surfaces · rate limits · the
server/client trust boundary.

Verify the permission matrix by test, not by reading: the correct role reaches
it, the incorrect role is denied. HIGH and CRITICAL changes get that pass in a
fresh context where practical — re-reading your own work inherits your own
blind spots.

---

## Stage 9 — Hand off

Open a **draft** PR carrying the risk rating, the Stage 2 plan, and the NOTHING
MISSED checklist from `CLAUDE.md`. Mark it ready once the gate is green and the
diff is reconciled.

Remaining stages are John's: preview verification, approval, merge, and
post-deploy verification. For a production release, the Release Gate workflow
(`.github/workflows/release-gate.yml`) is dispatched manually and still ends in
human sign-off. Say plainly which stages you completed and which you are
handing over — including any you could not finish.

---

## When someone asks you to skip

"Just make the change, it's tiny" is the exact request this SOP exists to
survive. Compress the stages — six lines total is fine for a genuine LOW —
but do not drop them. If the user explicitly and knowingly overrides after you
have said so once, that is their call to make: proceed, and note what was
skipped so the PR tells the truth.
