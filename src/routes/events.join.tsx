import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatEventDate } from "@/lib/event-utils";
import { toast } from "sonner";
import { Calendar, MapPin } from "lucide-react";

export const Route = createFileRoute("/events/join")({
  component: () => (
    <RequireAuth>
      <JoinEventPage />
    </RequireAuth>
  ),
});

type FoundEvent = {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string;
  description: string;
  status: string;
  host: { full_name: string } | null;
};

function JoinEventPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [event, setEvent] = useState<FoundEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setEvent(null);
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== 6) {
      toast.error("Codes are 6 characters.");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("events")
      .select(`
        id, name, type, date, location, description, status,
        host:host_id ( full_name )
      `)
      .eq("join_code", normalized)
      .maybeSingle();

    if (error || !data) {
      toast.error("No event found with that code.");
      setBusy(false);
      return;
    }
    if (data.status !== "open") {
      toast.error("This event is closed.");
      setBusy(false);
      return;
    }
    setEvent(data as unknown as FoundEvent);
    setBusy(false);
  };

  const handleApply = async () => {
    if (!event || !profile) return;
    setBusy(true);
    const { error } = await supabase.from("applications").insert({
      event_id: event.id,
      applicant_id: profile.id,
      status: "pending",
    });
    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("You've already applied to this event.");
      } else {
        toast.error(error.message);
      }
      setBusy(false);
      return;
    }
    toast.success("Your request has been submitted. The host will review applicants.");
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">Join an event</p>
      <h1 className="font-serif text-4xl mb-8">Enter your code</h1>

      <Card className="p-8 shadow-elegant">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <Label htmlFor="code">Six-character code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="font-mono text-2xl tracking-[0.4em] text-center uppercase h-14"
            />
          </div>
          <Button type="submit" variant="noir" className="w-full" disabled={busy}>
            {busy ? "Looking up…" : "Look up event"}
          </Button>
        </form>

        {event && (
          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {event.type}
            </p>
            <h2 className="font-serif text-2xl mb-3">{event.name}</h2>
            <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
              <p className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                {formatEventDate(event.date)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </p>
              {event.host?.full_name && (
                <p className="text-xs">Hosted by <span className="text-foreground">{event.host.full_name}</span></p>
              )}
            </div>
            {event.description && (
              <p className="text-sm leading-relaxed mb-6 italic text-muted-foreground">
                "{event.description}"
              </p>
            )}
            <Button onClick={handleApply} variant="gold" className="w-full" disabled={busy}>
              Request to join
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
