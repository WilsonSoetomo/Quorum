import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPES, generateJoinCode } from "@/lib/event-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/events/new")({
  component: () => (
    <RequireAuth>
      <NewEventPage />
    </RequireAuth>
  ),
});

function NewEventPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Dinner");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [totalSpots, setTotalSpots] = useState(8);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);

    // Try to insert with a fresh code; retry once on collision
    for (let attempt = 0; attempt < 3; attempt++) {
      const joinCode = generateJoinCode();
      const { data, error } = await supabase
        .from("events")
        .insert({
          host_id: profile.id,
          name,
          type,
          date: new Date(date).toISOString(),
          location,
          total_spots: totalSpots,
          description,
          is_private: false,
          join_code: joinCode,
          status: "open",
        })
        .select("id")
        .single();

      if (!error && data) {
        toast.success("List created.");
        navigate({ to: "/events/$eventId", params: { eventId: data.id } });
        return;
      }
      if (error && !error.message.includes("join_code")) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
    }
    toast.error("Could not generate a unique code. Try again.");
    setBusy(false);
  };

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">New list</p>
      <h1 className="font-serif text-3xl sm:text-4xl mb-6 sm:mb-8">The details</h1>

      <Card className="p-5 sm:p-8 shadow-elegant">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="name">List name</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Saturday Golf — Pelican Hill"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date">Date & time</Label>
              <Input
                id="date"
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pelican Hill Golf Club, Newport Beach"
            />
          </div>

          <div>
            <Label htmlFor="spots">Total spots</Label>
            <Input
              id="spots"
              type="number"
              min={1}
              max={500}
              required
              value={totalSpots}
              onChange={(e) => setTotalSpots(Number(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything good to know — skill level, dress code, what to bring."
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Used to help Smart Sort prioritize your queue.
            </p>
          </div>

          <Button type="submit" variant="gold" className="w-full" disabled={busy} size="lg">
            {busy ? "Creating…" : "Create list"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
