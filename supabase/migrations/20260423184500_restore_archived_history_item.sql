-- Allow users to undo archive by restoring a history item back into applications.

CREATE OR REPLACE FUNCTION public.restore_my_history_item(p_history_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_item public.joined_event_history%ROWTYPE;
BEGIN
  SELECT id
  INTO v_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT *
  INTO v_item
  FROM public.joined_event_history
  WHERE id = p_history_id
    AND applicant_id = v_profile_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'History item not found';
  END IF;

  IF v_item.event_id IS NULL THEN
    RAISE EXCEPTION 'Cannot restore: original event no longer exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_item.event_id) THEN
    RAISE EXCEPTION 'Cannot restore: event no longer exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.applications
    WHERE event_id = v_item.event_id
      AND applicant_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'You are already on this list';
  END IF;

  INSERT INTO public.applications (
    event_id,
    applicant_id,
    status,
    ai_score,
    ai_reasoning,
    applied_at
  ) VALUES (
    v_item.event_id,
    v_profile_id,
    COALESCE(v_item.status, 'pending'),
    NULL,
    NULL,
    COALESCE(v_item.original_applied_at, now())
  );

  DELETE FROM public.joined_event_history
  WHERE id = p_history_id
    AND applicant_id = v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_my_history_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_my_history_item(uuid) TO authenticated;
