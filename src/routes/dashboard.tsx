import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEventDate, statusColor, ApplicationStatus } from "@/lib/event-utils";
import { Plus, KeyRound, Calendar, MapPin } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

type HostedEvent = {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string;
  total_spots: number;
  join_code: string;
  status: string;
  approved_count: number;
};

type AppliedEvent = {
  id: string;
  status: ApplicationStatus;
  events: {
    id: string;
    name: string;
    type: string;
    date: string;
    location: string;
  } | null;
};

function Dashboard() {
  const { profile } = useAuth();
  const [hosted, setHosted] = useState<HostedEvent[]>([]);
  const [applied, setApplied] = useState<AppliedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const loadAll = async () => {
    if (!profile) return;
    setLoading(true);

    const { data: events } = await supabase
      .from("events")
      .select("id, name, type, date, location, total_spots, join_code, status")
      .eq("host_id", profile.id)
      .order("date", { ascending: true });

    if (events) {
      const eventIds = events.map((e) => e.id);
      const { data: counts } = await supabase
        .from("applications")
        .select("event_id, status")
        .in("event_id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "approved");

      const map: Record<string, number> = {};
      counts?.forEach((c) => {
        map[c.event_id] = (map[c.event_id] ?? 0) + 1;
      });

      setHosted(
        events.map((e) => ({ ...e, approved_count: map[e.id] ?? 0 })) as HostedEvent[],
      );
    }

    const { data: apps } = await supabase
      .from("applications")
      .select("id, status, events ( id, name, type, date, location )")
      .eq("applicant_id", profile.id)
      .order("applied_at", { ascending: false });

    setApplied((apps ?? []) as AppliedEvent[]);
    setLoading(false);
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-10">
        <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </p>
        <h1 className="font-serif text-4xl">Your lists</h1>
      </div>

      {/* Two paths */}
      <div className="grid md:grid-cols-2 gap-4 mb-12">
        <Link to="/events/new" className="group">
          <Card className="p-8 h-full bg-gradient-noir text-primary-foreground shadow-elegant hover:shadow-gold transition-shadow">
            <Plus className="w-8 h-8 text-gold mb-4" />
            <h2 className="font-serif text-2xl mb-2">Start a list</h2>
            <p className="text-sm opacity-80">
              Set the details, share a code, and manage requests as they come in.
            </p>
          </Card>
        </Link>
        <Link to="/events/join" className="group">
          <Card className="p-8 h-full hover:border-gold transition-colors shadow-elegant">
            <KeyRound className="w-8 h-8 text-gold mb-4" />
            <h2 className="font-serif text-2xl mb-2">Join a list</h2>
            <p className="text-sm text-muted-foreground">
              Enter a six-character code to add yourself to someone's queue.
            </p>
          </Card>
        </Link>
      </div>

      {/* Hosted events */}
      <Section title="Lists you're managing" empty="You haven't started any lists yet.">
        {hosted.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hosted.map((e) => (
              <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }}>
                <Card className="p-5 hover:border-gold transition-colors h-full">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {e.type}
                    </Badge>
                    <Badge
                      variant={e.status === "open" ? "default" : "secondary"}
                      className="text-[10px] uppercase"
                    >
                      {e.status}
                    </Badge>
                  </div>
                  <h3 className="font-serif text-xl mb-3 leading-tight">{e.name}</h3>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {formatEventDate(e.date)}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      {e.location}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {e.approved_count}/{e.total_spots} confirmed
                    </span>
                    <span className="font-mono text-gold tracking-wider">{e.join_code}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Applied events */}
      <Section title="Lists you've joined" empty="You haven't joined any lists yet.">
        {applied.length > 0 && (
          <div className="space-y-2">
            {applied.map((a) => (
              <Card key={a.id} className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg">{a.events?.name ?? "Event"}</h3>
                  <p className="text-xs text-muted-foreground">
                    {a.events?.date && formatEventDate(a.events.date)}
                    {a.events?.location && ` · ${a.events.location}`}
                  </p>
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full border uppercase tracking-wider ${statusColor(
                    a.status,
                  )}`}
                >
                  {a.status}
                </span>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {loading && (
        <p className="text-center text-muted-foreground text-sm mt-6">Loading…</p>
      )}
    </main>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: string;
}) {
  const hasChildren = !!children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <section className="mb-12">
      <h2 className="font-serif text-2xl mb-4">{title}</h2>
      {hasChildren ? children : <p className="text-sm text-muted-foreground italic">{empty}</p>}
    </section>
  );
}
