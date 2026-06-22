# SafetyIQ Internal Platform — GUS ATLAS AI Coding Guardrails v1.0

> Machine-readable coding standards for all AI-assisted development on the SafetyIQ platform.
> These rules are enforced before any code is written, reviewed, or released.

---

## INSTRUCTION PRIORITY ORDER

When instructions conflict, resolve by this hierarchy (top = highest authority):

1. **Security** — Never violate security, RLS, tenant isolation, or OWASP principles
2. **Standards** — These GUS ATLAS guardrails and this CLAUDE.md file
3. **Architecture** — Existing platform patterns (App Router, Server Components, Supabase, vitest)
4. **Specification** — Feature spec or task description in the current prompt
5. **Patterns** — Observed codebase conventions

If a task spec conflicts with a higher priority, STOP and flag the conflict before proceeding.

---

## STOP CONDITIONS

Stop immediately and ask before proceeding if any of these are true:

- The change touches RLS policies, auth middleware, or role permission logic
- The change drops or truncates a database table or column
- The change could expose data across tenant boundaries
- A migration is irreversible and no rollback plan exists
- The task references environment variables not in `.env.example`
- The change modifies `supabase/migrations/` files that have already been applied to production
- AI output would enter a workflow without human review when `requires_human_review = true`
- A production release is being prepared without a signed-off test plan

---

## TESTING REQUIREMENTS

Every code change must satisfy ALL of the following before PR:

### Required test types by change category
| Change type | Unit | Integration | RBAC test | E2E |
|-------------|------|-------------|-----------|-----|
| New module / page | ✓ required | — | ✓ required | Recommended |
| Auth / permission change | ✓ required | — | ✓ required | ✓ required |
| Database migration | — | ✓ required | ✓ required | — |
| AI gateway touchpoint | ✓ required | — | — | — |
| API route | ✓ required | — | ✓ required | — |
| Utility / lib function | ✓ required | — | — | — |

### Acceptance criteria checklist (must pass before merge)
- [ ] All existing tests still pass (`npm test`)
- [ ] New feature has at least one positive test and one negative/edge test
- [ ] Permission matrix tested: correct role can access, incorrect role is denied
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Security: no SQL injection surface, no XSS via unescaped output, no secrets in code

---

## MODULE SPECIFICATION CONTRACT

Every new module must declare the following before any code is written:

```
MODULE_ID: <unique snake_case key>
PURPOSE: <one sentence>
ROLES_ALLOWED: <comma-separated list from portalUserRoles>
GROUP: <Command | Commercial | People | Governance | Admin | Platform>
PATH_PREFIX: /employee/<slug>
DATA_OBJECTS: <table names this module reads/writes>
WORKFLOW_STATES: <if applicable>
ACCEPTANCE_CRITERIA:
  - [ ] <criterion 1>
  - [ ] <criterion 2>
```

Platform group modules additionally require:
- `PLATFORM_ROLES_ONLY: true` (only platform_admin / super_admin may access)
- A minimum of 5 test scenarios in `platform_test_plans`

---

## RELEASE & MIGRATION GATES

No code ships to production without all of the following:

1. **Test suite green** — `npm test` passes with zero failures
2. **Type check clean** — `npm run typecheck` passes
3. **Migration rehearsed** — Any SQL migration has been applied to a staging branch first
4. **Rollback plan documented** — Written rollback steps exist in the release record
5. **Human sign-off** — A platform_admin or super_admin has signed off the release in the Build & Release Management page
6. **QA test plan completed** — A platform_test_plan exists for this release and is marked `completed`
7. **Security scan logged** — At least one `infra_security_scans` entry for this release cycle

---

## AI GATEWAY RULES

All AI output that enters an official workflow MUST pass through `validateAIOutput()` in `lib/ai/gateway.ts`.

| Check | Failure action |
|-------|---------------|
| Structural — empty output | BLOCK |
| Safety — injection pattern | BLOCK |
| Privacy — PII detected | BLOCK (fail) |
| Referential — unresolved `{{placeholders}}` | FAIL |
| Logic — contradiction heuristic | WARN + flag for review |
| Confidence — below threshold | WARN + flag for review |
| Nothing Missed — schema keys absent | WARN |

**Human Authority Rule:** If `requires_human_review = true` on a prompt template, the output MUST NOT be applied to any record, document, or workflow item until a human has reviewed and approved it. No exceptions.

---

## VERTICAL PACKAGE STANDARD

Every domain vertical (e.g. SafePredict) must declare a manifest in `platform_vertical_packages` before any vertical-specific code ships:

```
vertical_key: <unique_snake_case>
name: <display name>
status: development → pilot → production (in order)
current_version: semver (e.g. 0.1.0)
scenario_test_count: minimum 20 before pilot; minimum 40 before production
pilot_feature_flags: JSON object of feature flags for pilot rollout
```

Vertical packages may not advance to `pilot` status with fewer than 20 test scenarios.
Vertical packages may not advance to `production` status with fewer than 40 test scenarios.

---

## SECURITY STANDARDS

- All database tables MUST have RLS enabled
- Platform group tables: accessible only to `platform_admin` / `super_admin`
- No raw SQL string concatenation — use parameterized Supabase queries only
- No `SUPABASE_SERVICE_ROLE_KEY` usage in client components — server only
- No secrets in code, comments, or git history
- All API routes must verify `supabase.auth.getUser()` before processing
- Cron routes must verify `CRON_SECRET` header
- Webhook routes must verify their respective webhook secrets

---

## ARCHITECTURAL CONVENTIONS

- **No new pages without a module catalog entry** in `lib/user-management.ts`
- **No client-side data mutation** — use Server Actions (`"use server"`)
- **No inline styles for brand colors** — use CSS variables (`var(--portal-gold)`, `var(--portal-muted)`)
- **No magic strings for roles** — use `portalUserRoles`, `isPortalOwnerRole()`, etc.
- **Audit trail** — any destructive or sensitive action must call `recordAuditEvent()` from `lib/audit/events.ts`
- **Error boundaries** — every new page route gets `error.tsx` if it doesn't already inherit one
- **Loading states** — async data pages must export a `loading.tsx` or use Suspense

---

## NOTHING MISSED CHECKLIST

Before submitting any PR, confirm:
- [ ] Module catalog entry added to `lib/user-management.ts`
- [ ] Sidebar nav entry added to `components/EmployeeSidebar.tsx`
- [ ] RLS policy written for every new table
- [ ] `updated_at` trigger attached to every mutable table
- [ ] Server action uses `revalidatePath()` after mutations
- [ ] Tests written and passing
- [ ] `.env.example` updated if new env vars are introduced
- [ ] Migration file timestamped correctly and not conflicting with existing files
