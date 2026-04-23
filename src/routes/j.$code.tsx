import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/j/$code")({
  component: JoinByLink,
});

function JoinByLink() {
  const { code } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const normalized = (code || "").trim().toUpperCase();
    if (normalized.length !== 6) {
      toast.error("That link doesn't look right.");
      navigate({ to: "/" });
      return;
    }

    // If not signed in, send them to auth and bring them back here after.
    if (!user) {
      navigate({
        to: "/auth",
        search: { redirect: `/j/${normalized}` },
      });
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, status")
        .eq("join_code", normalized)
        .maybeSingle();

      if (error || !data) {
        toast.error("No list found for that link.");
        navigate({ to: "/events/join" });
        return;
      }

      // Send them to the join screen with the code prefilled.
      navigate({
        to: "/events/join",
        search: { code: normalized },
      });
    })();
  }, [code, user, loading, navigate]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">Opening list…</p>
    </main>
  );
}
