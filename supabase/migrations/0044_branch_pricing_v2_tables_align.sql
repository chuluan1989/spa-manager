-- Align Production schema for Phase A/B/D pricing V2.
-- Production may already have these tables (created during UAT bootstrap).
-- Idempotent: CREATE IF NOT EXISTS + RLS policies.
--
-- Note: branch_service_prices intentionally has NO FK to service_durations
-- (normalized catalog from 0016 is unused; app stores durations inside branch_catalogs.catalog jsonb).

CREATE TABLE IF NOT EXISTS public.branch_catalogs (
  branch_id text PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  catalog jsonb NOT NULL DEFAULT '{"version":1,"categories":[],"services":[],"durations":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_catalogs_updated ON public.branch_catalogs(updated_at);

ALTER TABLE public.branch_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_anon_branch_catalogs ON public.branch_catalogs;
CREATE POLICY allow_all_anon_branch_catalogs ON public.branch_catalogs
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_authenticated_branch_catalogs ON public.branch_catalogs;
CREATE POLICY allow_all_authenticated_branch_catalogs ON public.branch_catalogs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.branch_service_prices (
  branch_id text NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  duration_id text NOT NULL,
  price double precision NOT NULL DEFAULT 0,
  commission_percent double precision NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, duration_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_service_prices_branch ON public.branch_service_prices(branch_id);

ALTER TABLE public.branch_service_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_anon_branch_service_prices ON public.branch_service_prices;
CREATE POLICY allow_all_anon_branch_service_prices ON public.branch_service_prices
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_authenticated_branch_service_prices ON public.branch_service_prices;
CREATE POLICY allow_all_authenticated_branch_service_prices ON public.branch_service_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['branch_catalogs', 'branch_service_prices'])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.branch_catalogs IS
  'Catalog dịch vụ V2 theo chi nhánh (jsonb categories/services/durations).';
COMMENT ON TABLE public.branch_service_prices IS
  'Giá/% hoa hồng V2 theo (branch_id, duration_id). Nguồn chuẩn cho hóa đơn mới.';
