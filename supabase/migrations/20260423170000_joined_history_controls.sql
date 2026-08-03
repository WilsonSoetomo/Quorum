-- Allow applicants to archive joined events and hide archived history items.

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS applicant_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.archive_my_application(p_application_id uuid)
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

  UPDATE public.applications
  SET archived_at = now()
  WHERE id = p_application_id
    AND applicant_id = v_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_my_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_my_application(uuid) TO authenticated;
