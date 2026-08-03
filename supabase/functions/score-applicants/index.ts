// Score event applicants with Anthropic Claude.
// Receives: { eventId }
// Auth: caller must be the host of the event (verified via JWT + RLS).
// Returns: { scored: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
    }

    const { eventId } = await req.json();
    if (!eventId || typeof eventId !== "string") {
      return json({ error: "eventId required" }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const accessToken = authHeader.replace("Bearer ", "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, 500);
    }

    // Admin client avoids JWT algorithm incompatibilities in PostgREST while
    // we still verify caller identity from the provided access token.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile) return json({ error: "Host profile not found" }, 403);

    // Load event + verify caller is host
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, name, type, description, host_id")
      .eq("id", eventId)
      .maybeSingle();

    if (evErr || !event) return json({ error: "Event not found" }, 404);
    if (event.host_id !== profile.id) {
      return json({ error: "Only the host can score applicants" }, 403);
    }

    // Load applicants (with profile info)
    const { data: applications, error: appErr } = await supabase
      .from("applications")
      .select("id, profiles:applicant_id(full_name, bio, tags)")
      .eq("event_id", eventId);

    if (appErr) return json({ error: appErr.message }, 500);
    if (!applications || applications.length === 0) {
      return json({ scored: 0 });
    }

    const applicantsForAi = applications.map((a: any) => ({
      id: a.id,
      name: a.profiles?.full_name || "Unknown",
      bio: a.profiles?.bio || "",
      tags: a.profiles?.tags || [],
    }));

    const systemPrompt = `You are an expert event curator. Your job is to score applicants 0-100 for fit at an event, based purely on the host's vibe notes and each applicant's bio + tags.

Scoring rubric:
- 85-100: Exceptional fit, strongly aligns with host vibe
- 65-84: Solid fit, would add value
- 40-64: Acceptable, might enjoy but not standout
- 0-39: Poor fit, likely mismatch

Be discerning. Spread scores out — do not bunch everyone in 70-85.`;

    const userPrompt = `EVENT: ${event.name} (${event.type})

HOST'S VIBE NOTES:
${event.description || "(none)"}

APPLICANTS (JSON):
${JSON.stringify(applicantsForAi, null, 2)}

Return JSON with this exact shape, scoring every applicant by their id:
{"scores":[{"id":"<applicant id>","score":<0-100 integer>,"reasoning":"<one concise sentence>"}]}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, errText);
      return json({ error: `AI scoring failed: ${aiRes.status}` }, 502);
    }

    const aiJson = await aiRes.json();
    const text = aiJson.content?.[0]?.text || "";
    // Extract JSON object from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("No JSON in AI response:", text);
      return json({ error: "AI returned invalid format" }, 502);
    }
    let parsed: { scores: Array<{ id: string; score: number; reasoning: string }> };
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.error("Failed to parse AI JSON:", match[0]);
      return json({ error: "AI returned malformed JSON" }, 502);
    }

    const validIds = new Set(applications.map((a: any) => a.id));
    let scored = 0;

    for (const s of parsed.scores) {
      if (!validIds.has(s.id)) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0)));
      const reasoning = String(s.reasoning || "").slice(0, 500);
      const { error: updErr } = await supabase
        .from("applications")
        .update({ ai_score: score, ai_reasoning: reasoning })
        .eq("id", s.id);
      if (!updErr) scored++;
    }

    return json({ scored });
  } catch (e) {
    console.error("score-applicants error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
