// Send approval/waitlist/decline notification email via Resend.
// Receives: { applicationId }
// Auth: caller must be host of the related event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY is not configured" }, 500);
    }

    const { applicationId } = await req.json();
    if (!applicationId) return json({ error: "applicationId required" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Use admin client to fetch all needed data (we already verified host below via RLS read)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select(`
        id, status,
        events ( id, name, type, date, location, host_id ),
        profiles:applicant_id ( full_name, user_id )
      `)
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !app) return json({ error: "Application not found" }, 404);

    // Verify caller is the host
    // @ts-ignore
    const hostProfileId = app.events?.host_id;
    const { data: hostProfile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("id", hostProfileId)
      .maybeSingle();
    if (!hostProfile || hostProfile.user_id !== user.id) {
      return json({ error: "Only the host can notify" }, 403);
    }

    // Get applicant email from auth.users
    // @ts-ignore
    const applicantUserId = app.profiles?.user_id;
    const { data: applicantAuth } = await admin.auth.admin.getUserById(applicantUserId);
    const toEmail = applicantAuth?.user?.email;
    if (!toEmail) return json({ error: "Applicant email missing" }, 400);

    // @ts-ignore
    const eventName = app.events?.name ?? "the event";
    // @ts-ignore
    const eventDate = app.events?.date ? new Date(app.events.date).toLocaleString() : "";
    // @ts-ignore
    const eventLocation = app.events?.location ?? "";
    // @ts-ignore
    const applicantName = app.profiles?.full_name || "there";

    let subject = "";
    let bodyHtml = "";
    const status = app.status as string;

    if (status === "approved") {
      subject = `You're in — ${eventName}`;
      bodyHtml = `
        <div style="font-family: 'DM Sans', Arial, sans-serif; background: #FAF9F6; padding: 40px 20px; color: #1a1a1a;">
          <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #eee; padding: 40px;">
            <p style="color: #C8A84B; letter-spacing: 0.2em; font-size: 11px; text-transform: uppercase; margin: 0 0 12px;">Prio</p>
            <h1 style="font-family: Georgia, serif; font-size: 28px; margin: 0 0 16px;">You're in.</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${escapeHtml(applicantName)},</p>
            <p style="font-size: 16px; line-height: 1.6;">Good news — you've been approved for <strong>${escapeHtml(eventName)}</strong>.</p>
            <div style="margin: 24px 0; padding: 16px 20px; background: #FAF9F6; border-left: 3px solid #C8A84B;">
              <p style="margin: 0 0 6px; font-size: 14px;"><strong>When:</strong> ${escapeHtml(eventDate)}</p>
              <p style="margin: 0; font-size: 14px;"><strong>Where:</strong> ${escapeHtml(eventLocation)}</p>
            </div>
            <p style="font-size: 14px; color: #555;">See you there.</p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Prio team</p>
          </div>
        </div>`;
    } else if (status === "waitlisted") {
      subject = `You're on the waitlist — ${eventName}`;
      bodyHtml = `
        <div style="font-family: 'DM Sans', Arial, sans-serif; background: #FAF9F6; padding: 40px 20px; color: #1a1a1a;">
          <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #eee; padding: 40px;">
            <p style="color: #C8A84B; letter-spacing: 0.2em; font-size: 11px; text-transform: uppercase; margin: 0 0 12px;">Prio</p>
            <h1 style="font-family: Georgia, serif; font-size: 28px; margin: 0 0 16px;">On the waitlist</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${escapeHtml(applicantName)},</p>
            <p style="font-size: 16px; line-height: 1.6;">You're on the waitlist for <strong>${escapeHtml(eventName)}</strong>. If a spot opens up, you'll be the first to know.</p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Prio team</p>
          </div>
        </div>`;
    } else if (status === "declined") {
      subject = `Update on ${eventName}`;
      bodyHtml = `
        <div style="font-family: 'DM Sans', Arial, sans-serif; background: #FAF9F6; padding: 40px 20px; color: #1a1a1a;">
          <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #eee; padding: 40px;">
            <p style="color: #C8A84B; letter-spacing: 0.2em; font-size: 11px; text-transform: uppercase; margin: 0 0 12px;">Prio</p>
            <h1 style="font-family: Georgia, serif; font-size: 28px; margin: 0 0 16px;">Thanks for applying</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${escapeHtml(applicantName)},</p>
            <p style="font-size: 16px; line-height: 1.6;">Unfortunately you weren't selected for <strong>${escapeHtml(eventName)}</strong> this time. We hope to see you at a future Prio event.</p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Prio team</p>
          </div>
        </div>`;
    } else {
      return json({ error: "Cannot notify pending applications" }, 400);
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Prio <onboarding@resend.dev>",
        to: [toEmail],
        subject,
        html: bodyHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", resendRes.status, errText);
      return json({ error: `Email failed: ${resendRes.status}` }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("notify-applicant error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
