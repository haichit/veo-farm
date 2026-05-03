-- Multi-user auth: roles, status, admin RLS, auto-create profile.
-- Run via: supabase db push  (or paste in Supabase SQL editor).

-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

-- 2. Auto-create profile row when a new auth.users row appears.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill profile rows for existing users (if any).
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. Helper: is the calling user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 5. Update RLS policies — owner always; admin can SELECT everything.

-- profiles: self select/update; admin select all.
DROP POLICY IF EXISTS profiles_self ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- Admin can update any profile (e.g. suspend / promote).
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflows_owner ON public.workflows;
CREATE POLICY workflows_select ON public.workflows FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY workflows_modify ON public.workflows FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- accounts
DROP POLICY IF EXISTS accounts_owner ON public.accounts;
CREATE POLICY accounts_select ON public.accounts FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY accounts_modify ON public.accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- jobs
DROP POLICY IF EXISTS jobs_owner ON public.jobs;
CREATE POLICY jobs_select ON public.jobs FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY jobs_modify ON public.jobs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- sub_jobs (user_id derived through job_id; check parent job ownership).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sub_jobs') THEN
    EXECUTE 'DROP POLICY IF EXISTS sub_jobs_owner ON public.sub_jobs';
    EXECUTE $POL$
      CREATE POLICY sub_jobs_select ON public.sub_jobs FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = sub_jobs.job_id
              AND (j.user_id = auth.uid() OR public.is_admin())
          )
        )
    $POL$;
  END IF;
END $$;
