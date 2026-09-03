import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!clientId || !clientSecret) {
    return jsonResponse({
      error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in edge function secrets.",
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);
  const callbackRedirectUri = `${supabaseUrl}/functions/v1/google-calendar-auth`;

  // ── OAuth callback from Google (GET ?code=...&state=...) ─────────────────
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (req.method === "GET" && (code || oauthError)) {
    if (oauthError || !code || !state) {
      return new Response(
        `<html><body>Authorization failed: ${oauthError ?? "missing code"}. You can close this tab.</body></html>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }

    let stateData: { faculty_id: string; redirect_uri: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response("Invalid state parameter", { status: 400 });
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new Response(`Token exchange failed: ${err}`, { status: 500 });
    }

    const tokens = await tokenRes.json();

    // Get Google email
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await supabase.from("faculty_google_connections").upsert(
      {
        faculty_id: stateData.faculty_id,
        google_email: userInfo.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? "",
        token_expiry: tokenExpiry,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "faculty_id" },
    );

    // Redirect back to the app
    const appUrl = new URL(stateData.redirect_uri);
    appUrl.searchParams.set("google_connected", "1");
    appUrl.searchParams.set("google_email", userInfo.email);
    return Response.redirect(appUrl.toString(), 302);
  }

  // ── Generate OAuth URL (GET ?action=url&faculty_id=...&redirect_uri=...) ──
  if (req.method === "GET" && url.searchParams.get("action") === "url") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const facultyId = url.searchParams.get("faculty_id");

    if (!redirectUri || !facultyId) {
      return jsonResponse({ error: "redirect_uri and faculty_id are required" }, 400);
    }

    const stateEncoded = btoa(JSON.stringify({ faculty_id: facultyId, redirect_uri: redirectUri }));

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", callbackRedirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", stateEncoded);

    return jsonResponse({ auth_url: authUrl.toString() });
  }

  // ── POST actions (status / disconnect) ───────────────────────────────────
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    if (body.action === "status") {
      const { faculty_id } = body;
      if (!faculty_id) return jsonResponse({ error: "faculty_id required" }, 400);
      const { data } = await supabase
        .from("faculty_google_connections")
        .select("google_email, token_expiry, updated_at")
        .eq("faculty_id", faculty_id)
        .maybeSingle();
      return jsonResponse({ connected: !!data, google_email: data?.google_email ?? null });
    }

    if (body.action === "disconnect") {
      const { faculty_id } = body;
      if (!faculty_id) return jsonResponse({ error: "faculty_id required" }, 400);
      await supabase.from("faculty_google_connections").delete().eq("faculty_id", faculty_id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
