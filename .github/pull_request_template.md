<!--
Change control. If you ran /change, most of this is already written — paste it
in. If you didn't, filling this in is the short way to find out which stage you
skipped. The rules themselves live in CLAUDE.md.
-->

## What & why

<!-- One paragraph. What changes for the user, and what problem it solves. -->

## Risk rating

**Rating:** <!-- LOW | MODERATE | HIGH | CRITICAL -->

**Why:** <!-- One sentence. Diff size is not risk; a one-line RLS edit is CRITICAL. -->

> MODERATE and above needs preview verification. HIGH and CRITICAL need a full
> security pass and John's approval. CRITICAL needs a rehearsed rollback.

**Did this hit a STOP CONDITION?** <!-- CLAUDE.md lists them: RLS, auth middleware,
role logic, applied migrations, tenant boundaries, undeclared env vars, AI output
where requires_human_review. If yes, say which and how it was resolved. -->

## Plan

| | |
|---|---|
| **Data impact** | |
| **API impact** | |
| **Auth impact** | |
| **UI impact** | |
| **Migration** | |
| **Rollback** | |
| **Regression risk** | |

<!-- New module? Include the full MODULE SPECIFICATION CONTRACT from CLAUDE.md
     (MODULE_ID, PURPOSE, ROLES_ALLOWED, GROUP, PATH_PREFIX, DATA_OBJECTS,
     WORKFLOW_STATES, ACCEPTANCE_CRITERIA). -->

## Gate

```
npm run typecheck →
npm test          →
npm run build     →
```

## Tests added

<!-- CLAUDE.md's matrix decides the minimum: new module → unit + RBAC;
     auth change → unit + RBAC + E2E; migration → integration + RBAC;
     API route → unit + RBAC. Every feature needs one positive and one
     negative/edge case. -->

## Anything in the diff that isn't in the plan

<!-- Explain it or remove it. "Nothing" is a fine answer. -->

## Checklist

- [ ] All existing tests still pass
- [ ] New feature has at least one positive and one negative/edge test
- [ ] Permission matrix tested — correct role allowed, incorrect role denied
- [ ] No TypeScript errors
- [ ] RLS enabled on every new table; `updated_at` trigger attached
- [ ] Server Actions used for mutations, with `revalidatePath()`
- [ ] `supabase.auth.getUser()` verified in every API route
- [ ] `recordAuditEvent()` on destructive or sensitive actions
- [ ] No raw SQL concatenation; no service-role key in a client component
- [ ] Module catalog entry (`lib/user-management.ts`) + sidebar entry added
- [ ] `.env.example` updated if new env vars were introduced
- [ ] Diff reconciled against the plan
- [ ] Rollback path written and reachable
