import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEffect } from "react";

export const Route = createFileRoute("/profile")({
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
});

function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setBio(profile.bio);
      setTags(profile.tags.join(", "));
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const tagsArr = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, bio, tags: tagsArr })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated.");
    await refreshProfile();
  };

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <p className="text-gold tracking-[0.25em] text-[10px] uppercase mb-2">Your profile</p>
      <h1 className="font-serif text-4xl mb-2">How hosts see you</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Your bio and tags shape how the AI scores your fit for events.
      </p>

      <Card className="p-8 shadow-elegant">
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bio">Short bio</Label>
            <Textarea
              id="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="scratch golfer, hedge fund partner"
            />
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="competitive, social, big spender"
            />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
