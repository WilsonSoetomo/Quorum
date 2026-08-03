-- All events should be public; access is controlled by join code.
UPDATE public.events
SET is_private = false
WHERE is_private = true;

ALTER TABLE public.events
ALTER COLUMN is_private SET DEFAULT false;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_is_public_only;

ALTER TABLE public.events
ADD CONSTRAINT events_is_public_only CHECK (is_private = false);
