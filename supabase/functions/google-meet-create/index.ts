import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!clientId || !clientSecret) {
    return jsonResponse({
      error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: {
    faculty_id: string;
    session_id: string;
    title: string;
    description?: string;
    start_time: string;
    duration_minutes: number;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { faculty_id, session_id, title, description, start_time, duration_minutes } = body;

  if (!faculty_id || !session_id || !title || !start_time || !duration_minutes) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  // Get faculty Google connection
  const { data: conn, error: connErr } = await supabase
    .from("faculty_google_connections")
    .select("access_token, refresh_token, token_expiry, google_email")
    .eq("faculty_id", faculty_id)
    .maybeSingle();

  if (connErr || !conn) {
    return jsonResponse({
      error: "Faculty has not connected a Google account. Please connect Google Calendar first.",
    }, 400);
  }

  // Refresh token if expired or nearly expired
  let accessToken = conn.access_token;
  const expiry = conn.token_expiry ? new Date(conn.token_expiry) : null;
  const needsRefresh = !expiry || expiry.getTime() < Date.now() + 5 * 60 * 1000;

  if (needsRefresh && conn.refresh_token) {
    const refreshed = await refreshAccessToken(conn.refresh_token, clientId, clientSecret);
    if (refreshed) {
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("faculty_google_connections")
        .update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() })
        .eq("faculty_id", faculty_id);
    }
  }

  // Calculate end time
  const startDate = new Date(start_time);
  const endDate = new Date(startDate.getTime() + duration_minutes * 60 * 1000);

  // Create Google Calendar event with Meet conference
  const eventBody = {
    summary: title,
    description: description ?? "",
    start: { dateTime: startDate.toISOString(), timeZone: "UTC" },
    end: { dateTime: endDate.toISOString(), timeZone: "UTC" },
    conferenceData: {
      createRequest: {
        requestId: `lms-${session_id}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const calRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    },
  );

  if (!calRes.ok) {
    const err = await calRes.text();
    return jsonResponse({ error: `Google Calendar API error: ${err}` }, 500);
  }

  const calEvent = await calRes.json();

  const meetUrl = calEvent.conferenceData?.entryPoints?.find(
    (ep: { entryPointType: string }) => ep.entryPointType === "video",
  )?.uri ?? calEvent.hangoutLink ?? null;

  const meetingId = calEvent.conferenceData?.conferenceId ?? null;
  const calendarEventId = calEvent.id ?? null;

  // Update the live_session with the Meet details
  const { error: updateErr } = await supabase
    .from("live_sessions")
    .update({
      google_meet_url: meetUrl,
      calendar_event_id: calendarEventId,
      meeting_id: meetingId,
      organizer_email: conn.google_email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  if (updateErr) {
    return jsonResponse({ error: `Failed to update session: ${updateErr.message}` }, 500);
  }

  return jsonResponse({
    success: true,
    google_meet_url: meetUrl,
    calendar_event_id: calendarEventId,
    meeting_id: meetingId,
    organizer_email: conn.google_email,
  });
});
