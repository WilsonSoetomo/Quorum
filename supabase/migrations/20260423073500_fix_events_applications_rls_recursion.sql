-- Fix RLS recursion between public.events and public.applications
-- Root cause:
--   events SELECT policy queried applications
--   applications SELECT/UPDATE policies queried events
-- This created an infinite policy evaluation loop.

-- Helper to resolve current user's profile id.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Helper to check whether the current user hosts a given event.
-- SECURITY DEFINER avoids RLS recursion by evaluating with definer privileges.
CREATE OR REPLACE FUNCTION public.is_event_host(target_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = target_event_id
      AND e.host_id = public.current_profile_id()
  )
$$;

-- Recreate applications policies that previously selected from public.events.
DROP POLICY IF EXISTS "View own or hosted applications" ON public.applications;
CREATE POLICY "View own or hosted applications"
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (
    applicant_id = public.current_profile_id()
    OR public.is_event_host(event_id)
  );

DROP POLICY IF EXISTS "Hosts can update applications for their events" ON public.applications;
CREATE POLICY "Hosts can update applications for their events"
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (public.is_event_host(event_id));

-- Optional hardening for insert/delete checks to avoid repeated profile subqueries.
DROP POLICY IF EXISTS "Authenticated users can create their own applications" ON public.applications;
CREATE POLICY "Authenticated users can create their own applications"
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = public.current_profile_id());

DROP POLICY IF EXISTS "Applicants can delete their own pending applications" ON public.applications;
CREATE POLICY "Applicants can delete their own pending applications"
  ON public.applications
  FOR DELETE
  TO authenticated
  USING (
    applicant_id = public.current_profile_id()
    AND status = 'pending'
  );
