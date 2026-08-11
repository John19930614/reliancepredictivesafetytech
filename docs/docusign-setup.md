# DocuSign setup runbook

The code is finished and deployed. Nothing in this document is a code change —
it is the account-side configuration that has never been done, which is why
`POST /api/docusign/connect` currently answers `503 DocuSign is not enabled for
this environment.`

Work through it in order. Steps 1–4 are in DocuSign, step 5 is in a terminal,
step 6 is back in DocuSign, step 7 proves it works.

**Do this in the demo (sandbox) environment first.** The app's built-in defaults
already point at the sandbox, so a sandbox run needs no extra configuration and
cannot email a real client by mistake. Step 8 covers going live.

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

## 1. Sign in to the developer account

<https://developers.docusign.com> → **My Apps & Keys**, or
<https://admindemo.docusign.com> → **Integrations → Apps and Keys**.

If you have no developer account, create one from that first link (free).

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

DocuSign admin → **Settings → Integrations → Connect** → **Add Configuration →
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

## 8. Going live

When the sandbox run is clean, promote the integration key in DocuSign
(**Apps and Keys → Actions → Promote**), then set the production hosts and
redeploy:

```bash
npx vercel env add DOCUSIGN_OAUTH_BASE_URL production   # https://account.docusign.com
```

```bash
npx vercel env add DOCUSIGN_BASE_PATH production        # https://na1.docusign.net (use YOUR account's host)
```

Re-grant consent against `https://account.docusign.com/oauth/auth?...`, and add
a second Connect configuration in the production account — Connect settings do
**not** carry across from demo.

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
