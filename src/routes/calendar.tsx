import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { formatEventDate } from "@/lib/event-utils";
import { CalendarDays, MapPin, ArrowLeft } from "lucide-react";

type CalendarEvent = {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string;
  role: "hosting" | "attending" | "hosting_attending";
  attendanceStatus?: string;
};

export const Route = createFileRoute("/calendar")({
  component: () => (
    <RequireAuth>
      <CalendarPage />
    </RequireAuth>
  ),
});

function CalendarPage() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (!profile) return;
    loadCalendarEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const loadCalendarEvents = async () => {
    if (!profile) return;
    setLoading(true);

    const { data: hosted } = await supabase
      .from("events")
      .select("id, name, type, date, location")
      .eq("host_id", profile.id);

    const { data: attending } = await supabase
      .from("applications")
      .select("status, events ( id, name, type, date, location )")
      .eq("applicant_id", profile.id);

    const combined = new Map<string, CalendarEvent>();

    (hosted ?? []).forEach((e) => {
      combined.set(e.id, {
        id: e.id,
        name: e.name,
        type: e.type,
        date: e.date,
        location: e.location,
        role: "hosting",
      });
    });

    (attending ?? []).forEach((row: any) => {
      const e = row.events;
      if (!e?.id) return;
      const existing = combined.get(e.id);
      if (existing) {
        combined.set(e.id, {
          ...existing,
          role: "hosting_attending",
          attendanceStatus: row.status,
        });
        return;
      }
      combined.set(e.id, {
        id: e.id,
        name: e.name,
        type: e.type,
        date: e.date,
        location: e.location,
        role: "attending",
        attendanceStatus: row.status,
      });
    });

    setEvents(
      [...combined.values()].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    );
    setLoading(false);
  };

  const daysWithEvents = useMemo(
    () => events.map((e) => new Date(e.date)),
    [events],
  );

  const eventsForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter((e) => {
      const d = new Date(e.date);
      return (
        d.getFullYear() === selectedDate.getFullYear() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getDate() === selectedDate.getDate()
      );
    });
  }, [events, selectedDate]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-3 h-3" /> Back to dashboard
      </Link>

      <div className="mb-6 sm:mb-8">
        <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">Calendar view</p>
        <h1 className="font-serif text-3xl sm:text-4xl">Hosting + attending</h1>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-4 sm:gap-6 items-start">
        <Card className="p-3 sm:p-4 shadow-elegant overflow-x-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasEvents: daysWithEvents }}
            modifiersClassNames={{
              hasEvents:
                "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-gold",
            }}
            className="mx-auto"
          />
        </Card>

        <Card className="p-5 sm:p-6 shadow-elegant">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-gold" />
            <h2 className="font-serif text-2xl">
              {selectedDate ? selectedDate.toLocaleDateString() : "Pick a date"}
            </h2>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading events…</p>
          ) : eventsForSelectedDay.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No events on this date.</p>
          ) : (
            <div className="space-y-3">
              {eventsForSelectedDay.map((e) => (
                <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }}>
                  <Card className="p-4 hover:border-gold transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {e.type}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        {e.role === "hosting" && (
                          <Badge className="text-[10px] uppercase tracking-wider">Hosting</Badge>
                        )}
                        {e.role === "attending" && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                            Attending
                          </Badge>
                        )}
                        {e.role === "hosting_attending" && (
                          <Badge className="text-[10px] uppercase tracking-wider">
                            Hosting + attending
                          </Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-serif text-xl leading-tight mb-1">{e.name}</h3>
                    <p className="text-xs text-muted-foreground mb-1">{formatEventDate(e.date)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {e.location}
                    </p>
                    {e.attendanceStatus && (
                      <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider">
                        Your status: {e.attendanceStatus}
                      </p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
