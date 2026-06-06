import { createAdminClient } from "@/lib/supabase/admin";

// Timing-safe hex comparison to prevent timing attacks on HMAC verification
async function verifyVectorSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = process.env.VECTOR_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  // Vector sends: "sha256=<hex>"
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const receivedHex = signatureHeader.slice(prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedHex.length !== receivedHex.length) return false;

  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
  }
  return diff === 0;
}

type VectorCertification = {
  name: string;
  issuedAt: string;
  expiresAt?: string | null;
  documentUrl?: string | null;
};

type VectorWebhookPayload = {
  event: string;
  userId: string;
  userEmail?: string | null;
  userName: string;
  courseId: string;
  courseName: string;
  score?: number | null;
  passed?: boolean | null;
  completedAt: string;
  timeSpentSeconds?: number | null;
  certification?: VectorCertification | null;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-vector-signature");

  if (!(await verifyVectorSignature(rawBody, signature))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: VectorWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as VectorWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.userId || !payload.courseId || !payload.completedAt || !payload.userName) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Look up the internal module by external course ID
  const { data: module } = await admin
    .from("training_modules")
    .select("id, title")
    .eq("external_lms_course_id", payload.courseId)
    .maybeSingle();

  // Insert the completion record
  const { data: completion, error: completionError } = await admin
    .from("training_completions")
    .insert({
      module_id: module?.id ?? null,
      client_id: null, // can be enriched later via user roster sync
      external_lms_user_id: payload.userId,
      external_lms_course_id: payload.courseId,
      learner_name: payload.userName,
      learner_email: payload.userEmail ?? null,
      score: payload.score ?? null,
      passed: payload.passed ?? null,
      completed_at: payload.completedAt,
      time_spent_seconds: payload.timeSpentSeconds ?? null,
      raw_payload: JSON.parse(rawBody),
    })
    .select("id")
    .single();

  if (completionError || !completion) {
    console.error("training webhook: completion insert failed", completionError?.message);
    return Response.json({ error: "Failed to record completion" }, { status: 500 });
  }

  // If a certification is included, upsert the certification record
  if (payload.certification) {
    const cert = payload.certification;

    const { data: certRecord, error: certError } = await admin
      .from("training_certifications")
      .insert({
        completion_id: completion.id,
        client_id: null,
        learner_name: payload.userName,
        learner_email: payload.userEmail ?? null,
        certification_name: cert.name,
        issued_at: cert.issuedAt,
        expires_at: cert.expiresAt ?? null,
        cert_document_url: cert.documentUrl ?? null,
        status: "Active",
      })
      .select("id, expires_at")
      .single();

    if (certError) {
      console.error("training webhook: certification insert failed", certError.message);
    }

    // Fire an immediate notification if the cert expires within 30 days
    if (certRecord?.expires_at) {
      const expiresAt = new Date(certRecord.expires_at);
      const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        const { data: adminRoles } = await admin
          .from("user_roles")
          .select("user_id")
          .in("role", ["platform_admin", "super_admin"])
          .eq("account_status", "active");

        const adminUserIds = (adminRoles ?? []).map((row) => row.user_id);

        if (adminUserIds.length > 0) {
          await admin.from("portal_notifications").insert(
            adminUserIds.map((userId) => ({
              recipient_user_id: userId,
              title: `Certification expiring in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`,
              body: `${payload.userName} — ${cert.name} expires ${expiresAt.toLocaleDateString()}.`,
              priority: daysUntilExpiry <= 7 ? "high" : "medium",
              source_type: "training_certification",
              source_id: certRecord.id,
              action_href: "/employee/training",
              dedupe_key: `cert-expiry-soon-${certRecord.id}`,
            })),
          );
        }
      }
    }
  }

  return Response.json({ ok: true, completionId: completion.id });
}
