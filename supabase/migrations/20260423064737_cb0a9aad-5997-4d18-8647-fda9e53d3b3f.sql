
-- ============ TABLES (created first, no policies) ============

CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  total_spots INT NOT NULL CHECK (total_spots > 0),
  description TEXT NOT NULL DEFAULT '',
  join_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_host_id ON public.events(host_id);
CREATE INDEX idx_events_join_code ON public.events(join_code);

CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','waitlisted','declined')),
  ai_score INT,
  ai_reasoning TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(event_id, applicant_id)
);

CREATE INDEX idx_applications_event_id ON public.applications(event_id);
CREATE INDEX idx_applications_applicant_id ON public.applications(applicant_id);

-- ============ RLS ============

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Events
CREATE POLICY "View public events or own events"
  ON public.events FOR SELECT TO authenticated
  USING (
    is_private = false
    OR host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR id IN (
      SELECT event_id FROM public.applications
      WHERE applicant_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Hosts can insert their own events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Hosts can update their own events"
  ON public.events FOR UPDATE TO authenticated
  USING (host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Hosts can delete their own events"
  ON public.events FOR DELETE TO authenticated
  USING (host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Applications
CREATE POLICY "View own or hosted applications"
  ON public.applications FOR SELECT TO authenticated
  USING (
    applicant_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR event_id IN (
      SELECT id FROM public.events
      WHERE host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can create their own applications"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (applicant_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Hosts can update applications for their events"
  ON public.applications FOR UPDATE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE host_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Applicants can delete their own pending applications"
  ON public.applications FOR DELETE TO authenticated
  USING (
    applicant_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND status = 'pending'
  );

-- ============ FUNCTIONS & TRIGGERS ============

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, bio, tags)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'bio', ''),
    COALESCE(
      string_to_array(NULLIF(NEW.raw_user_meta_data ->> 'tags', ''), ','),
      '{}'::text[]
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_application_reviewed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    NEW.reviewed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_applications_reviewed_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_application_reviewed_at();

CREATE OR REPLACE FUNCTION public.enforce_spot_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_approved INT;
  spots INT;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    SELECT total_spots INTO spots FROM public.events WHERE id = NEW.event_id;
    SELECT COUNT(*) INTO current_approved
      FROM public.applications
      WHERE event_id = NEW.event_id AND status = 'approved' AND id <> NEW.id;
    IF current_approved >= spots THEN
      RAISE EXCEPTION 'Event is at full capacity (% spots)', spots;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER enforce_application_spot_limit
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_spot_limit();

-- Realtime
ALTER TABLE public.applications REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
