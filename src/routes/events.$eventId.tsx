import { useEffect, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  formatEventDate,
  scoreColor,
  STATUS_LABELS,
  ApplicationStatus,
} from "@/lib/event-utils";
import { toast } from "sonner";
import {
  Calendar,
  MapPin,
  Copy,
  Sparkles,
  Check,
  Clock,
  X as XIcon,
  ArrowLeft,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/events/$eventId")({
  component: () => (
    <RequireAuth>
      <EventDetail />
    </RequireAuth>
  ),
});

type EventRow = {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string;
  description: string;
  total_spots: number;
  join_code: string;
  status: "open" | "closed";
  is_private: boolean;
  host_id: string;
};

type ApplicantRow = {
  id: string;
  status: ApplicationStatus;
  ai_score: number | null;
  ai_reasoning: string | null;
  applied_at: string;
  applicant: {
    id: string;
    full_name: string;
    bio: string;
    tags: string[];
  } | null;
};

function EventDetail() {
  const { eventId } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [apps, setApps] = useState<ApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [tab, setTab] = useState<"all" | "approved" | "waitlist">("all");

  const isHost = !!event && !!profile && event.host_id === profile.id;

  const loadEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !data) {
      toast.error("Event not found");
      navigate({ to: "/dashboard" });
      return;
    }
    setEvent(data as EventRow);
  }, [eventId, navigate]);

  const loadApps = useCallback(async () => {
    const { data } = await supabase
      .from("applications")
      .select(`
        id, status, ai_score, ai_reasoning, applied_at,
        applicant:applicant_id ( id, full_name, bio, tags )
      `)
      .eq("event_id", eventId)
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("applied_at", { ascending: true });
    setApps((data ?? []) as unknown as ApplicantRow[]);
  }, [eventId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadEvent();
      await loadApps();
      setLoading(false);
    })();
  }, [loadEvent, loadApps]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications", filter: `event_id=eq.${eventId}` },
        () => loadApps(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        () => loadEvent(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, loadApps, loadEvent]);

  if (loading || !event) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  const approvedCount = apps.filter((a) => a.status === "approved").length;
  const waitlistCount = apps.filter((a) => a.status === "waitlisted").length;
  const spotsLeft = Math.max(0, event.total_spots - approvedCount);
  const eventFull = approvedCount >= event.total_spots;

  const copyCode = () => {
    navigator.clipboard.writeText(event.join_code);
    toast.success("Code copied");
  };

  const updateStatus = async (
    appId: string,
    next: ApplicationStatus,
    notify = true,
  ) => {
    const target = apps.find((a) => a.id === appId);
    if (!target) return;

    // Auto-route approval to waitlist if full
    let actual = next;
    if (next === "approved" && eventFull && target.status !== "approved") {
      actual = "waitlisted";
      toast.info("List is full — moved to standby instead.");
    }

    const { error } = await supabase
      .from("applications")
      .update({ status: actual })
      .eq("id", appId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked as ${STATUS_LABELS[actual]}.`);

    if (notify && actual !== "pending") {
      await sendNotification(appId);
    }

    // If we declined an approved applicant, auto-promote first waitlisted
    if (target.status === "approved" && actual !== "approved") {
      await promoteFirstWaitlist();
    }
  };

  const promoteFirstWaitlist = async () => {
    const { data: nextUp } = await supabase
      .from("applications")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "waitlisted")
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("applied_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextUp) {
      const { error } = await supabase
        .from("applications")
        .update({ status: "approved" })
        .eq("id", nextUp.id);
      if (!error) {
        toast.success("Promoted the next person from standby.");
        await sendNotification(nextUp.id);
      }
    }
  };

  const sendNotification = async (appId: string) => {
    try {
      const { error } = await supabase.functions.invoke("notify-applicant", {
        body: { applicationId: appId },
      });
      if (error) {
        console.error("notify error", error);
      }
    } catch (e) {
      console.error("notify failed", e);
    }
  };

  const runAiScoring = async () => {
    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-applicants", {
        body: { eventId },
      });
      if (error) throw error;
      toast.success(`Sorted ${data?.scored ?? 0} entries.`);
      await loadApps();
    } catch (e: any) {
      toast.error(e?.message || "Smart Sort failed");
    } finally {
      setScoring(false);
    }
  };

  const approveTopN = async () => {
    const candidates = apps
      .filter((a) => a.status === "pending" || a.status === "waitlisted")
      .sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1))
      .slice(0, spotsLeft);
    if (candidates.length === 0) {
      toast.info("No spots left or no one to confirm.");
      return;
    }
    let approved = 0;
    for (const c of candidates) {
      const { error } = await supabase
        .from("applications")
        .update({ status: "approved" })
        .eq("id", c.id);
      if (!error) {
        approved++;
        sendNotification(c.id);
      }
    }
    toast.success(`Confirmed top ${approved}.`);
  };

  const notifyAllApproved = async () => {
    const approved = apps.filter((a) => a.status === "approved");
    if (approved.length === 0) {
      toast.info("No one confirmed yet.");
      return;
    }
    let sent = 0;
    for (const a of approved) {
      try {
        await supabase.functions.invoke("notify-applicant", {
          body: { applicationId: a.id },
        });
        sent++;
      } catch {}
    }
    toast.success(`Sent ${sent} notifications.`);
  };

  const toggleStatus = async (checked: boolean) => {
    const next = checked ? "open" : "closed";
    const { error } = await supabase
      .from("events")
      .update({ status: next })
      .eq("id", eventId);
    if (error) toast.error(error.message);
    else toast.success(`List ${next}`);
  };

  const visible =
    tab === "approved"
      ? apps.filter((a) => a.status === "approved")
      : tab === "waitlist"
        ? apps.filter((a) => a.status === "waitlisted")
        : apps;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-3 h-3" /> Back to dashboard
      </Link>

      {/* Event header */}
      <Card className="p-8 mb-8 shadow-elegant">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {event.type}
              </Badge>
              {event.is_private && (
                <Badge variant="secondary" className="text-[10px] uppercase">
                  Private
                </Badge>
              )}
              <Badge
                variant={event.status === "open" ? "default" : "secondary"}
                className="text-[10px] uppercase"
              >
                {event.status}
              </Badge>
            </div>
            <h1 className="font-serif text-4xl mb-3">{event.name}</h1>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                {formatEventDate(event.date)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </p>
            </div>
            {event.description && (
              <p className="mt-4 text-sm italic text-muted-foreground max-w-xl">
                "{event.description}"
              </p>
            )}
          </div>

          {/* Right side: code + counter + toggle */}
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Join code
              </p>
              <button
                onClick={copyCode}
                className="font-mono text-2xl text-gold tracking-[0.25em] flex items-center gap-2 hover:opacity-80"
                title="Click to copy"
              >
                {event.join_code}
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Confirmed
              </p>
              <p className="font-serif text-3xl">
                {approvedCount}
                <span className="text-muted-foreground text-base">/{event.total_spots}</span>
              </p>
            </div>
            {isHost && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Closed</span>
                <Switch
                  checked={event.status === "open"}
                  onCheckedChange={toggleStatus}
                />
                <span className="text-xs text-muted-foreground">Open</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {!isHost && (
        <Card className="p-6 mb-8 bg-secondary/40 border-dashed">
          <p className="text-sm text-muted-foreground">
            You're viewing this list as a guest. The organizer manages the queue.
          </p>
        </Card>
      )}

      {isHost && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              onClick={runAiScoring}
              variant="gold"
              disabled={scoring || apps.length === 0}
            >
              <Sparkles className="w-4 h-4" />
              {scoring ? "Sorting…" : "Smart Sort"}
            </Button>
            <Button
              onClick={approveTopN}
              variant="noir"
              disabled={spotsLeft === 0 || apps.length === 0}
            >
              Confirm next {Math.min(spotsLeft, apps.filter((a) => a.status !== "approved" && a.status !== "declined").length)}
            </Button>
            <Button onClick={notifyAllApproved} variant="outline">
              <Mail className="w-4 h-4" />
              Notify confirmed
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">Everyone ({apps.length})</TabsTrigger>
              <TabsTrigger value="approved">Confirmed ({approvedCount})</TabsTrigger>
              <TabsTrigger value="waitlist">Standby ({waitlistCount})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-6">
              {visible.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-12 italic">
                  No one here yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {visible.map((a) => (
                    <ApplicantCard
                      key={a.id}
                      app={a}
                      onApprove={() => updateStatus(a.id, "approved")}
                      onWaitlist={() => updateStatus(a.id, "waitlisted")}
                      onDecline={() => updateStatus(a.id, "declined")}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}

function ApplicantCard({
  app,
  onApprove,
  onWaitlist,
  onDecline,
}: {
  app: ApplicantRow;
  onApprove: () => void;
  onWaitlist: () => void;
  onDecline: () => void;
}) {
  return (
    <Card className="p-5 shadow-elegant">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-serif text-xl">
              {app.applicant?.full_name || "Anonymous"}
            </h3>
            <StatusChip status={app.status} />
          </div>
          {app.applicant?.bio && (
            <p className="text-sm text-muted-foreground mb-2">{app.applicant.bio}</p>
          )}
          {app.applicant?.tags && app.applicant.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {app.applicant.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {app.ai_reasoning && (
            <p className="text-xs italic text-muted-foreground border-l-2 border-gold pl-3 mt-3">
              "{app.ai_reasoning}"
            </p>
          )}
        </div>

        {/* Score */}
        {app.ai_score != null && (
          <div className="w-32">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Priority
              </span>
              <span className="font-serif text-2xl">{app.ai_score}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${scoreColor(app.ai_score)}`}
                style={{ width: `${app.ai_score}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="gold" onClick={onApprove} disabled={app.status === "approved"}>
            <Check className="w-3.5 h-3.5" /> Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={onWaitlist} disabled={app.status === "waitlisted"}>
            <Clock className="w-3.5 h-3.5" /> Standby
          </Button>
          <Button size="sm" variant="ghost" onClick={onDecline} disabled={app.status === "declined"}>
            <XIcon className="w-3.5 h-3.5" /> Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusChip({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    pending: "bg-secondary text-secondary-foreground",
    approved: "bg-emerald-100 text-emerald-900",
    waitlisted: "bg-amber-100 text-amber-900",
    declined: "bg-rose-100 text-rose-900",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
