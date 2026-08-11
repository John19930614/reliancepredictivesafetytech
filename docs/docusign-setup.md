# DocuSign setup runbook

The code is finished and deployed. Nothing in this document is a code change —
it is the account-side configuration that has never been done, which is why
`POST /api/docusign/connect` currently answers `503 DocuSign is not enabled for
this environment.`

Work through it in order. Steps 1–4 are in DocuSign, step 5 is in a terminal,
step 6 is back in DocuSign, step 7 proves it works.

**The sandbox is not optional.** DocuSign does not allow an integration key to be
created in a production account — the Apps and Integration Keys panel there says
so outright:

> You cannot create an integration key in production. To create an IK, use your
> developer account.

So the order is fixed: build the app in the developer account, prove it against
the demo environment, then use **Go-Live** to promote the key into production and
cut the four environment values over (step 8). Confirmed against this account on
2026-08-11.

| | Sandbox | Production |
|---|---|---|
| Admin | `admindemo.docusign.com` | `admin.docusign.com` |
| OAuth host | `account-d.docusign.com` | `account.docusign.com` |
| API host | `demo.docusign.net` | `na1`/`na2`/`na3`/`eu`… `.docusign.net` |
| Env vars | 6 | 8 (adds the two hosts) |
| Test envelopes | simulated | **real email to a real inbox** |

**Precaution when testing against production:** make the test proposal's client
contact your own email address. `sendProposalForDocusign()` sends to whatever
contact is on the proposal, so a self-addressed envelope gives you the full
round trip — send, sign, webhook, File Center filing — with nothing reaching a
customer.

---

## What you are collecting

Six values. Keep them somewhere safe as you go — three of them are shown once.

| Env var | What it is | Secret? |
|---|---|---|
| `DOCUSIGN_ENABLED` | `true` — the master switch | no |
| `DOCUSIGN_INTEGRATION_KEY` | the app's Integration Key (a GUID) | no (a client id) |
| `DOCUSIGN_USER_ID` | **User ID** of the account the app impersonates (a GUID) | no |
| `DOCUSIGN_ACCOUNT_ID` | **API Account ID** (a GUID) | no |
| `DOCUSIGN_PRIVATE_KEY` | RSA private key generated in step 3 | **YES** |
| `DOCUSIGN_WEBHOOK_SECRET` | Connect HMAC key from step 6 | **YES** |

---

## 1. Sign in to the DEVELOPER account

<https://admindemo.docusign.com/apps-and-keys>, or
<https://developers.docusign.com> → **My Apps & Keys**.

If you have no developer account, create one free at
<https://go.docusign.com/o/sandbox/> — a production account does not come with
one automatically.

> **Steps 2–7 all use the DEVELOPER account's own values.** The demo account has
> its own User ID and API Account ID, different from the production ones. Mixing
> a production GUID into the demo configuration authenticates against the wrong
> account and fails in a way that reads like a bad key. The production values are
> needed only at step 8.

## 2. Create the app

**Add App and Integration Key** → name it `Reliance Predictive Safety Platform`.

The **Integration Key** GUID appears at the top of the app page.
→ `DOCUSIGN_INTEGRATION_KEY`

## 3. Generate the RSA keypair

On the same app page, under **Authentication**, choose **Generate RSA**.

**The private key is displayed exactly once.** Copy the whole block, including
the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines.
→ `DOCUSIGN_PRIVATE_KEY`

If you lose it, delete the keypair and generate a new one — it cannot be
re-displayed.

## 4. Collect the two account GUIDs

- **User ID** — on the same **Apps and Keys** page, under *My Account
  Information*. This is a GUID, **not** your email address. → `DOCUSIGN_USER_ID`
- **API Account ID** — same panel, directly beneath it. → `DOCUSIGN_ACCOUNT_ID`

While on this page, add a **Redirect URI** to the app (required before consent
can be granted in step 7):

```
https://reliancepredictivesafetytechnologies.com/api/docusign/connect
```

## 5. Set the environment variables

The app reads these on the server only; none is exposed to the browser.

Run each of these and paste the value when prompted. Do them one at a time — the
CLI asks for the value on stdin, which keeps the secrets out of your shell
history:

```bash
npx vercel env add DOCUSIGN_ENABLED production
```

```bash
npx vercel env add DOCUSIGN_INTEGRATION_KEY production
```

```bash
npx vercel env add DOCUSIGN_USER_ID production
```

```bash
npx vercel env add DOCUSIGN_ACCOUNT_ID production
```

```bash
npx vercel env add DOCUSIGN_PRIVATE_KEY production
```

```bash
npx vercel env add DOCUSIGN_WEBHOOK_SECRET production
```

Notes:

- `DOCUSIGN_PRIVATE_KEY` — paste the PEM with real newlines. `lib/docusign/config.ts`
  also accepts a single line with literal `\n` sequences, so either form works.
- `DOCUSIGN_WEBHOOK_SECRET` — you do not have this yet. Do step 6 first, then
  come back and run its command.
- The sandbox URLs (`DOCUSIGN_OAUTH_BASE_URL`, `DOCUSIGN_BASE_PATH`) are the
  built-in defaults. Leave them unset until step 8.

Environment variables are read at request time, but a redeploy is the reliable
way to pick them up:

```bash
npx vercel --prod --yes
```

## 6. Register the Connect listener

Demo admin → <https://admindemo.docusign.com/connect> → **Add Configuration →
Custom**.

| Field | Value |
|---|---|
| Name | `Reliance Platform` |
| URL to Publish | `https://reliancepredictivesafetytechnologies.com/api/docusign/connect` |
| Data Format | **JSON** |
| Include Data | tick **Envelope**, and **Recipients** |
| Envelope Events | **Completed**, plus Sent / Delivered / Declined / Voided if you want the full trail |
| Require HMAC | **on** — then **Add Secret Key** |

Copy the generated HMAC secret → `DOCUSIGN_WEBHOOK_SECRET`, then run the
step-5 command for it and redeploy.

**JSON format matters.** `parseDocusignWebhookEvent()` reads
`data.envelopeSummary` / `data.envelopeId` from the JSON "Envelope" payload. The
legacy XML format will not parse and the route will answer `400 Missing envelope
id`.

## 7. Grant consent, then test

**Consent (one-time).** JWT impersonation fails with
`consent_required` until the impersonated user has granted it. Open this once,
substituting your integration key, and accept:

```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=https://reliancepredictivesafetytechnologies.com/api/docusign/connect
```

**Check the webhook is live.** An unsigned POST must be rejected — a `401`
proves the route is configured and enforcing HMAC. A `503` means the env vars
have not taken effect yet:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://reliancepredictivesafetytechnologies.com/api/docusign/connect -H "Content-Type: application/json" -d "{}"
```

| Response | Meaning |
|---|---|
| `503` | env vars missing or `DOCUSIGN_ENABLED` is not `true` — redeploy |
| `401` | **correct** — configured, and rejecting an unsigned request |
| `400` | signature accepted but payload had no envelope id |

**End-to-end.** In the platform: open a proposal, make sure the assigned client
has a contact **with an email address** (`sendProposalForDocusign()` refuses
without one), get it approved, mark it sent, then use the DocuSign panel.
DocuSign admin → **Connect → Logs** shows each delivery attempt and the response
we returned.

On `completed`, the webhook pulls the signed PDF into the client's File Center
and stamps the acceptance onto the proposal. It is idempotent — a repeated
`completed` event is a no-op because `completed_file_id` is already set.

## 8. Go-Live: promoting into production

Only after the demo round trip in step 7 is clean.

**Promote the key.** <https://developers.docusign.com> → **My Apps & Keys** →
your app → **Actions → Start Go-Live review** (or *Promote*). DocuSign requires
a history of successful demo API calls before it will promote; the console shows
where you stand. The Integration Key GUID does **not** change, and the RSA
keypair travels with it.

**Cut four variables over.** Everything else stays as it is:

| Variable | Change |
|---|---|
| `DOCUSIGN_INTEGRATION_KEY` | unchanged — the same key, now promoted |
| `DOCUSIGN_PRIVATE_KEY` | unchanged — the keypair rides on the key |
| `DOCUSIGN_USER_ID` | → the **production** account's User ID |
| `DOCUSIGN_ACCOUNT_ID` | → the **production** API Account ID |
| `DOCUSIGN_OAUTH_BASE_URL` | → `https://account.docusign.com` |
| `DOCUSIGN_BASE_PATH` | → the production **Account Base URI** |
| `DOCUSIGN_WEBHOOK_SECRET` | → new: Connect must be configured again (below) |

Both production GUIDs and the Base URI are on
<https://admin.docusign.com/apps-and-keys>, in the *My Account Information*
panel — the same panel that refuses to create a key.

> **Base path is host only — no `/restapi`.** `lib/docusign/client.ts` builds
> `${basePath}/restapi/v2.1/accounts/...` itself. Including `/restapi` gives a
> doubled path and 404s every envelope call.

Use `npx vercel env rm <NAME> production` then `add` to replace a value, and
redeploy.

**Re-do two things that never cross environments:**

1. **Consent** — grant it again against `https://account.docusign.com/oauth/auth?...`
   (production host, no `-d`). Demo consent does not carry.
2. **Connect** — create the configuration again at
   <https://admin.docusign.com/connect> with a fresh HMAC secret. Connect
   settings never copy across accounts.

Then re-run the step-7 curl against production and expect `401`.

---

## Who can send

Since the maker–checker change, sending for signature requires the approver
capability (`user_roles.can_approve_proposals`) **and** a proposal already in
`sent`. Today that is John only. Steve will not see a working DocuSign send
regardless of DocuSign being configured — that is deliberate, not a
misconfiguration.

## Where the code lives

| Path | Role |
|---|---|
| [`app/api/docusign/connect/route.ts`](../app/api/docusign/connect/route.ts) | the webhook — HMAC check, parse, record |
| [`lib/docusign/config.ts`](../lib/docusign/config.ts) | env reading, `getDocusignConfigStatus()` |
| [`lib/docusign/client.ts`](../lib/docusign/client.ts) | JWT auth, envelope creation, `verifyDocusignHmac()` |
| [`lib/proposals/docusign.ts`](../lib/proposals/docusign.ts) | send + `recordDocusignEnvelopeEvent()`, File Center filing |
