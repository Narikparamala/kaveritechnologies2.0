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
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!clientId || !clientSecret) {
    return jsonResponse({ error: "Google OAuth is not configured." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);
  const callbackRedirectUri = `${supabaseUrl}/functions/v1/google-calendar-auth`;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (req.method === "GET" && (code || oauthError)) {
    if (oauthError || !code || !state) {
      return new Response(`Authorization failed: ${oauthError ?? "missing code"}. You can close this tab.`, {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    let stateData: { faculty_id: string; redirect_uri: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response("Invalid state parameter", { status: 400 });
    }

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
      return new Response(`Token exchange failed: ${await tokenRes.text()}`, { status: 500 });
    }

    const tokens = await tokenRes.json();
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoRes.ok) {
      return new Response(`Could not read Google account: ${await userInfoRes.text()}`, { status: 500 });
    }
    const userInfo = await userInfoRes.json();

    const { data: existing, error: existingError } = await supabase
      .from("faculty_google_connections")
      .select("refresh_token")
      .eq("faculty_id", stateData.faculty_id)
      .maybeSingle();
    if (existingError) {
      return new Response(`Could not access Google connection storage: ${existingError.message}`, { status: 500 });
    }

    const refreshToken = tokens.refresh_token || existing?.refresh_token || null;
    if (!refreshToken) {
      return new Response("Google did not return an offline refresh token. Disconnect the app in your Google Account and connect again.", { status: 400 });
    }

    const { error: saveError } = await supabase.from("faculty_google_connections").upsert({
      faculty_id: stateData.faculty_id,
      google_email: userInfo.email,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expiry: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "faculty_id" });

    if (saveError) {
      return new Response(`Google authorization succeeded, but saving the connection failed: ${saveError.message}`, { status: 500 });
    }

    const appUrl = new URL(stateData.redirect_uri);
    appUrl.searchParams.set("google_connected", "1");
    appUrl.searchParams.set("google_email", userInfo.email);
    return Response.redirect(appUrl.toString(), 302);
  }

  if (req.method === "GET" && url.searchParams.get("action") === "url") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const facultyId = url.searchParams.get("faculty_id");
    if (!redirectUri || !facultyId) return jsonResponse({ error: "redirect_uri and faculty_id are required" }, 400);

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
    authUrl.searchParams.set("state", btoa(JSON.stringify({ faculty_id: facultyId, redirect_uri: redirectUri })));
    return jsonResponse({ auth_url: authUrl.toString() });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (body.action === "status") {
      if (!body.faculty_id) return jsonResponse({ error: "faculty_id required" }, 400);
      const { data, error } = await supabase
        .from("faculty_google_connections")
        .select("google_email, token_expiry, updated_at")
        .eq("faculty_id", body.faculty_id)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ connected: Boolean(data), google_email: data?.google_email ?? null });
    }

    if (body.action === "disconnect") {
      if (!body.faculty_id) return jsonResponse({ error: "faculty_id required" }, 400);
      const { error } = await supabase
        .from("faculty_google_connections")
        .delete()
        .eq("faculty_id", body.faculty_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }
    return jsonResponse({ error: "Unknown action" }, 400);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
