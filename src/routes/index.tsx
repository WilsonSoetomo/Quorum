import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/40 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
          <p className="text-gold tracking-[0.3em] text-xs uppercase mb-6 font-medium">
            Curated Gatherings
          </p>
          <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] mb-6">
            Invite the right people,
            <br />
            <span className="italic text-gold">not just the first ones.</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
            Prio is the host's tool for curating guest lists at golf, poker, dinners, tennis,
            and other social events — scoring applicants by fit, not arrival time.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to="/auth">Create an event</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/auth">Join with a code</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Three-step */}
      <section className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-10">
          <Step
            n="01"
            title="Host an event"
            body="Set the vibe — golf, poker, dinner. Define spots and share a six-character join code."
          />
          <Step
            n="02"
            title="Receive applicants"
            body="Guests apply to attend. Their bio and tags become part of the picture."
          />
          <Step
            n="03"
            title="Curate with AI"
            body="Run AI prioritization to score every applicant for fit. You make the final call."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-serif text-xl">Prio</p>
          <p className="text-xs text-muted-foreground tracking-wide">
            Curated gatherings for the right rooms.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <p className="text-gold font-serif text-3xl mb-3">{n}</p>
      <h3 className="font-serif text-2xl mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
