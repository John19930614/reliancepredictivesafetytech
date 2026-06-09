import { createClient } from "@/lib/supabase/server";

type TwilioIceServer = {
  url?: string;
  urls?: string;
  username?: string;
  credential?: string;
};

async function getTwilioIceServers(): Promise<RTCIceServer[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    return [];
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Ttl: "86400" }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Twilio NTS token request failed.", response.status, await response.text().catch(() => ""));
      return [];
    }

    const data = (await response.json()) as { ice_servers?: TwilioIceServer[] };

    return (data.ice_servers ?? [])
      .map((server): RTCIceServer | null => {
        const urls = server.urls ?? server.url;
        if (!urls) {
          return null;
        }
        return server.username && server.credential
          ? { urls, username: server.username, credential: server.credential }
          : { urls };
      })
      .filter((server): server is RTCIceServer => server !== null);
  } catch (error) {
    console.error("Could not fetch Twilio NTS ICE servers.", error);
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();

  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  // Preferred: short-lived TURN credentials from Twilio Network Traversal Service.
  iceServers.push(...(await getTwilioIceServers()));

  // Fallback: static TURN credentials supplied directly via env.
  const turnUrls = process.env.TURN_URLS?.trim();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();

  if (turnUrls && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.split(",").map((u) => u.trim()).filter(Boolean),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return Response.json({ iceServers });
}
