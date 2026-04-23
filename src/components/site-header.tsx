import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-serif text-2xl tracking-tight">Prio</span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-gold" />
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/profile">Profile</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild variant="gold" size="sm">
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
