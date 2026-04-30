CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_flows_user ON public.flows(user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON public.profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY flows_owner ON public.flows
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
