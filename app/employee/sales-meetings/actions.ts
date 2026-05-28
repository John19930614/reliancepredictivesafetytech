"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { SalesMeetingInviteEmail } from "@/emails/sales-meeting-invite";
import { getResendClient, NOTIFICATION_FROM } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type SalesMeeting = Database["public"]["Tables"]["sales_video_meetings"]["Row"];
type SalesMeetingInvite = Database["public"]["Tables"]["sales_video_meeting_invites"]["Row"];
type SalesMeetingParticipant = Database["public"]["Tables"]["sales_video_meeting_participants"]["Row"];

export type SalesMeetingInviteRecipient = {
  email: string;
  name?: string;
};

export type SalesMeetingInviteInput = {
  title: string;
  recipients: SalesMeetingInviteRecipient[];
  clientId?: string | null;
  demoRequestId?: string | null;
};

export type SalesMeetingInviteResult = {
  meeting: SalesMeeting;
  hostUrl: string;
  expiresAt: string;
  emailConfigured: boolean;
  invites: Array<{
    invite: SalesMeetingInvite;
    joinUrl: string;
    emailSent: boolean;
    error: string | null;
  }>;
};

export type SalesMeetingJoinResult = {
  meeting: SalesMeeting;
  participant: SalesMeetingParticipant;
  participants: SalesMeetingParticipant[];
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function cleanText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

function getSiteUrl() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
    : null;

  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    productionUrl ||
    "https://reliancepredictivesafetytechnologies.com"
  ).replace(/\/$/, "");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

async function getAuthorizedEmployee() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in as an employee.");
  }

  const { data: role, error } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!role) {
    throw new Error("Only active employees can manage sales meetings.");
  }

  return { supabase, user };
}

async function getCurrentUser() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in or allow guest access before joining this meeting.");
  }

  return { supabase, user };
}

function getAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before using outside sales meeting links.");
  }

  return admin;
}

async function isEmployeeUser(userId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("account_status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function loadParticipants(admin: SupabaseAdminClient, meetingId: string) {
  const { data, error } = await admin
    .from("sales_video_meeting_participants")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SalesMeetingParticipant[];
}

async function upsertEmployeeParticipant(admin: SupabaseAdminClient, meeting: SalesMeeting, user: { id: string; email?: string | null }) {
  const { data: profile } = await admin
    .from("employee_chat_profiles")
    .select("display_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  const displayName = profile?.display_name || user.email || profile?.email || "Employee";

  const { data: existing, error: existingError } = await admin
    .from("sales_video_meeting_participants")
    .select("*")
    .eq("meeting_id", meeting.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const { data, error } = await admin
      .from("sales_video_meeting_participants")
      .update({
        display_name: displayName,
        email: user.email ?? profile?.email ?? null,
        status: "joined",
        joined_at: new Date().toISOString(),
        left_at: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not join the meeting.");
    }

    return data as SalesMeetingParticipant;
  }

  const { data, error } = await admin
    .from("sales_video_meeting_participants")
    .insert({
      meeting_id: meeting.id,
      user_id: user.id,
      participant_type: "employee",
      display_name: displayName,
      email: user.email ?? profile?.email ?? null,
      status: "joined",
      joined_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not join the meeting.");
  }

  return data as SalesMeetingParticipant;
}

export async function createSalesMeetingInvite(input: SalesMeetingInviteInput): Promise<SalesMeetingInviteResult> {
  const { user } = await getAuthorizedEmployee();
  const admin = getAdminClient();
  const title = cleanText(input.title) || "SafetyDocs360 sales presentation";
  const recipients = input.recipients
    .map((recipient) => ({
      email: normalizeEmail(recipient.email),
      name: cleanText(recipient.name) || null,
    }))
    .filter((recipient) => recipient.email);
  const uniqueRecipients = Array.from(new Map(recipients.map((recipient) => [recipient.email, recipient])).values());

  if (uniqueRecipients.length === 0) {
    throw new Error("Add at least one outside recipient email.");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: meeting, error: meetingError } = await admin
    .from("sales_video_meetings")
    .insert({
      title,
      created_by: user.id,
      client_id: cleanText(input.clientId) || null,
      demo_request_id: cleanText(input.demoRequestId) || null,
      status: "scheduled",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (meetingError || !meeting) {
    throw new Error(meetingError?.message ?? "Could not create sales meeting.");
  }

  await upsertEmployeeParticipant(admin, meeting as SalesMeeting, user);

  const siteUrl = getSiteUrl();
  const resend = getResendClient();
  const inviterName = user.email ?? "Reliance";
  const inviteResults: SalesMeetingInviteResult["invites"] = [];

  for (const recipient of uniqueRecipients) {
    const token = createInviteToken();
    const joinUrl = `${siteUrl}/sales-meetings/${encodeURIComponent(token)}`;
    const { data: invite, error: inviteError } = await admin
      .from("sales_video_meeting_invites")
      .insert({
        meeting_id: meeting.id,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        token_hash: hashToken(token),
        status: resend ? "sent" : "pending",
        sent_at: resend ? new Date().toISOString() : null,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (inviteError || !invite) {
      inviteResults.push({
        invite: {
          id: crypto.randomUUID(),
          meeting_id: meeting.id,
          recipient_email: recipient.email,
          recipient_name: recipient.name,
          token_hash: "",
          status: "pending",
          sent_at: null,
          accepted_at: null,
          revoked_at: null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        joinUrl,
        emailSent: false,
        error: inviteError?.message ?? "Could not create invite.",
      });
      continue;
    }

    let emailSent = false;
    let emailError: string | null = null;

    if (resend) {
      const { error } = await resend.emails.send({
        from: NOTIFICATION_FROM,
        to: recipient.email,
        subject: `Join ${title}`,
        react: SalesMeetingInviteEmail({
          meetingTitle: title,
          presenterName: inviterName,
          joinUrl,
          expiresAt: formatExpiry(expiresAt),
        }),
      });

      emailSent = !error;
      emailError = error?.message ?? null;

      if (error) {
        await admin.from("sales_video_meeting_invites").update({ status: "pending", sent_at: null }).eq("id", invite.id);
      }
    }

    inviteResults.push({
      invite: invite as SalesMeetingInvite,
      joinUrl,
      emailSent,
      error: emailError,
    });
  }

  const activityClientId = cleanText(input.clientId) || meeting.client_id;

  if (activityClientId) {
    await admin
      .from("company_sales_activities")
      .insert({
        client_id: activityClientId,
        activity_type: "Sales Meeting",
        title: `Video meeting invite: ${title}`,
        notes: `Invited ${uniqueRecipients.map((recipient) => recipient.email).join(", ")}`,
        activity_date: new Date().toISOString().slice(0, 10),
        owner: user.email ?? null,
        outcome: resend ? "Email sent" : "Invite links generated",
      })
      .then(({ error }) => {
        if (error) {
          console.error("Could not write sales activity.", error);
        }
      });
  }

  revalidatePath("/employee/sales");
  revalidatePath("/employee/demo-showcase");

  return {
    meeting: meeting as SalesMeeting,
    hostUrl: `${siteUrl}/employee/sales-meetings/${meeting.id}`,
    expiresAt,
    emailConfigured: Boolean(resend),
    invites: inviteResults,
  };
}

export async function joinSalesMeetingAsEmployee(meetingId: string): Promise<SalesMeetingJoinResult> {
  const { user } = await getAuthorizedEmployee();
  const admin = getAdminClient();
  const { data: meeting, error } = await admin.from("sales_video_meetings").select("*").eq("id", cleanText(meetingId)).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!meeting || meeting.status === "ended" || meeting.status === "cancelled" || new Date(meeting.expires_at).getTime() <= Date.now()) {
    throw new Error("That sales meeting is not available.");
  }

  const now = new Date().toISOString();
  const { data: activeMeeting, error: updateError } = await admin
    .from("sales_video_meetings")
    .update({
      status: "active",
      started_at: meeting.started_at ?? now,
    })
    .eq("id", meeting.id)
    .select("*")
    .single();

  if (updateError || !activeMeeting) {
    throw new Error(updateError?.message ?? "Could not start the meeting.");
  }

  const participant = await upsertEmployeeParticipant(admin, activeMeeting as SalesMeeting, user);
  const participants = await loadParticipants(admin, activeMeeting.id);

  return {
    meeting: activeMeeting as SalesMeeting,
    participant,
    participants,
  };
}

export async function joinSalesMeetingByToken(token: string, displayName: string): Promise<SalesMeetingJoinResult> {
  const { user } = await getCurrentUser();
  const admin = getAdminClient();
  const cleanToken = cleanText(token);

  if (!cleanToken) {
    throw new Error("Meeting link is missing.");
  }

  const { data: invite, error: inviteError } = await admin
    .from("sales_video_meeting_invites")
    .select("*")
    .eq("token_hash", hashToken(cleanToken))
    .maybeSingle();

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  if (!invite || invite.revoked_at || invite.status === "revoked" || new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new Error("This meeting invite is expired or no longer available.");
  }

  const { data: meeting, error: meetingError } = await admin
    .from("sales_video_meetings")
    .select("*")
    .eq("id", invite.meeting_id)
    .maybeSingle();

  if (meetingError) {
    throw new Error(meetingError.message);
  }

  if (!meeting || meeting.status === "ended" || meeting.status === "cancelled" || new Date(meeting.expires_at).getTime() <= Date.now()) {
    throw new Error("This sales meeting is no longer available.");
  }

  const guestName = cleanText(displayName) || invite.recipient_name || invite.recipient_email;
  const { data: existing, error: existingError } = await admin
    .from("sales_video_meeting_participants")
    .select("*")
    .eq("meeting_id", meeting.id)
    .eq("guest_user_id", user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const now = new Date().toISOString();
  const participantPayload = {
    meeting_id: meeting.id,
    invite_id: invite.id,
    guest_user_id: user.id,
    participant_type: "guest",
    display_name: guestName,
    email: invite.recipient_email,
    status: "joined",
    joined_at: now,
    left_at: null,
  };

  const { data: participant, error: participantError } = existing
    ? await admin
        .from("sales_video_meeting_participants")
        .update(participantPayload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await admin
        .from("sales_video_meeting_participants")
        .insert(participantPayload)
        .select("*")
        .single();

  if (participantError || !participant) {
    throw new Error(participantError?.message ?? "Could not join the meeting.");
  }

  const { data: activeMeeting, error: updateError } = await admin
    .from("sales_video_meetings")
    .update({
      status: "active",
      started_at: meeting.started_at ?? now,
    })
    .eq("id", meeting.id)
    .select("*")
    .single();

  if (updateError || !activeMeeting) {
    throw new Error(updateError?.message ?? "Could not open the meeting.");
  }

  await admin
    .from("sales_video_meeting_invites")
    .update({ status: "accepted", accepted_at: invite.accepted_at ?? now })
    .eq("id", invite.id);

  const participants = await loadParticipants(admin, meeting.id);

  return {
    meeting: activeMeeting as SalesMeeting,
    participant: participant as SalesMeetingParticipant,
    participants,
  };
}

export async function updateSalesMeetingMediaState(input: {
  meetingId: string;
  participantId: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
}) {
  const { user } = await getCurrentUser();
  const admin = getAdminClient();
  const { data: participant, error } = await admin
    .from("sales_video_meeting_participants")
    .select("*")
    .eq("id", cleanText(input.participantId))
    .eq("meeting_id", cleanText(input.meetingId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!participant) {
    throw new Error("Meeting participant was not found.");
  }

  const employee = await isEmployeeUser(user.id);
  const ownsParticipant = participant.user_id === user.id || participant.guest_user_id === user.id;

  if (!employee && !ownsParticipant) {
    throw new Error("You cannot update this meeting participant.");
  }

  const { error: updateError } = await admin
    .from("sales_video_meeting_participants")
    .update({
      audio_enabled: input.audioEnabled,
      video_enabled: input.videoEnabled,
      screen_sharing: input.screenSharing,
    })
    .eq("id", participant.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function leaveSalesMeeting(meetingId: string, participantId: string) {
  const { user } = await getCurrentUser();
  const admin = getAdminClient();
  const { data: participant, error } = await admin
    .from("sales_video_meeting_participants")
    .select("*")
    .eq("id", cleanText(participantId))
    .eq("meeting_id", cleanText(meetingId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!participant) {
    return;
  }

  const employee = await isEmployeeUser(user.id);
  const ownsParticipant = participant.user_id === user.id || participant.guest_user_id === user.id;

  if (!employee && !ownsParticipant) {
    throw new Error("You cannot leave this meeting for another participant.");
  }

  const { error: updateError } = await admin
    .from("sales_video_meeting_participants")
    .update({
      status: "left",
      left_at: new Date().toISOString(),
      audio_enabled: false,
      video_enabled: false,
      screen_sharing: false,
    })
    .eq("id", participant.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function endSalesMeeting(meetingId: string) {
  await getAuthorizedEmployee();
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("sales_video_meetings")
    .update({ status: "ended", ended_at: now })
    .eq("id", cleanText(meetingId));

  if (error) {
    throw new Error(error.message);
  }

  await admin
    .from("sales_video_meeting_participants")
    .update({
      status: "left",
      left_at: now,
      audio_enabled: false,
      video_enabled: false,
      screen_sharing: false,
    })
    .eq("meeting_id", cleanText(meetingId))
    .neq("status", "left");
}

export async function revokeSalesMeetingInvite(inviteId: string) {
  await getAuthorizedEmployee();
  const admin = getAdminClient();
  const { error } = await admin
    .from("sales_video_meeting_invites")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", cleanText(inviteId));

  if (error) {
    throw new Error(error.message);
  }
}
