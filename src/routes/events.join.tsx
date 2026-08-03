import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
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

const joinSearchSchema = z.object({
  code: z.string().optional(),
});

export const Route = createFileRoute("/events/join")({
  validateSearch: joinSearchSchema,
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
  const search = useSearch({ from: "/events/join" });
  const [code, setCode] = useState((search.code ?? "").toUpperCase());
  const [event, setEvent] = useState<FoundEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLookupDone = useRef(false);

  const lookup = async (rawCode: string) => {
    setBusy(true);
    setEvent(null);
    const normalized = rawCode.trim().toUpperCase();
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
      toast.error("No list found with that code.");
      setBusy(false);
      return;
    }
    if (data.status !== "open") {
      toast.error("This list is closed.");
      setBusy(false);
      return;
    }
    setEvent(data as unknown as FoundEvent);
    setBusy(false);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookup(code);
  };

  // Auto-lookup when arriving via a shared link (?code=ABC123)
  useEffect(() => {
    if (autoLookupDone.current) return;
    if (search.code && search.code.length === 6) {
      autoLookupDone.current = true;
      lookup(search.code);
    }
  }, [search.code]);

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
        toast.error("You're already on this list.");
      } else {
        toast.error(error.message);
      }
      setBusy(false);
      return;
    }
    toast.success("You're on the list. The organizer will be in touch.");
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">Join a list</p>
      <h1 className="font-serif text-3xl sm:text-4xl mb-6 sm:mb-8">Enter your code</h1>

      <Card className="p-5 sm:p-8 shadow-elegant">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <Label htmlFor="code">Six-character code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="font-mono text-xl sm:text-2xl tracking-[0.25em] sm:tracking-[0.4em] text-center uppercase h-12 sm:h-14"
            />
          </div>
          <Button type="submit" variant="noir" className="w-full" disabled={busy}>
            {busy ? "Looking up…" : "Look up list"}
          </Button>
        </form>

        {event && (
          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {event.type}
            </p>
            <h2 className="font-serif text-xl sm:text-2xl mb-3 leading-tight">{event.name}</h2>
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
                <p className="text-xs">Organized by <span className="text-foreground">{event.host.full_name}</span></p>
              )}
            </div>
            {event.description && (
              <p className="text-sm leading-relaxed mb-6 italic text-muted-foreground">
                "{event.description}"
              </p>
            )}
            <Button onClick={handleApply} variant="gold" className="w-full" disabled={busy}>
              Add me to the list
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
