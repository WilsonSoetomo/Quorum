-- Archive/delete joined items should remove applicant from live event list.
-- We store archived snapshots in a dedicated history table and delete
-- the original application row from public.applications.

CREATE TABLE IF NOT EXISTS public.joined_event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_application_id UUID,
  event_id UUID,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  event_date TIMESTAMPTZ,
  event_location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  original_applied_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_joined_event_history_applicant_id
  ON public.joined_event_history(applicant_id);

CREATE INDEX IF NOT EXISTS idx_joined_event_history_archived_at
  ON public.joined_event_history(archived_at DESC);

ALTER TABLE public.joined_event_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants can view their own joined history" ON public.joined_event_history;
CREATE POLICY "Applicants can view their own joined history"
  ON public.joined_event_history
  FOR SELECT
  TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Migrate previously archived rows to history, then remove them from live applications.
INSERT INTO public.joined_event_history (
  applicant_id,
  source_application_id,
  event_id,
  event_name,
  event_type,
  event_date,
  event_location,
  status,
  original_applied_at,
  archived_at
)
SELECT
  a.applicant_id,
  a.id,
  a.event_id,
  COALESCE(e.name, 'Event'),
  COALESCE(e.type, ''),
  e.date,
  COALESCE(e.location, ''),
  a.status,
  a.applied_at,
  COALESCE(a.archived_at, now())
FROM public.applications a
LEFT JOIN public.events e ON e.id = a.event_id
WHERE a.archived_at IS NOT NULL
  AND COALESCE(a.applicant_hidden, false) = false;

DELETE FROM public.applications
WHERE archived_at IS NOT NULL
   OR COALESCE(applicant_hidden, false) = true;

CREATE OR REPLACE FUNCTION public.archive_my_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_app RECORD;
BEGIN
  SELECT id
  INTO v_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT
    a.id,
    a.event_id,
    a.status,
    a.applied_at,
    e.name AS event_name,
    e.type AS event_type,
    e.date AS event_date,
    e.location AS event_location
  INTO v_app
  FROM public.applications a
  LEFT JOIN public.events e ON e.id = a.event_id
  WHERE a.id = p_application_id
    AND a.applicant_id = v_profile_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  INSERT INTO public.joined_event_history (
    applicant_id,
    source_application_id,
    event_id,
    event_name,
    event_type,
    event_date,
    event_location,
    status,
    original_applied_at
  ) VALUES (
    v_profile_id,
    v_app.id,
    v_app.event_id,
    COALESCE(v_app.event_name, 'Event'),
    COALESCE(v_app.event_type, ''),
    v_app.event_date,
    COALESCE(v_app.event_location, ''),
    v_app.status,
    v_app.applied_at
  );

  DELETE FROM public.applications
  WHERE id = p_application_id
    AND applicant_id = v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_history_item(p_history_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT id
  INTO v_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  DELETE FROM public.joined_event_history
  WHERE id = p_history_id
    AND applicant_id = v_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'History item not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_my_application(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_history_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_my_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_history_item(uuid) TO authenticated;
