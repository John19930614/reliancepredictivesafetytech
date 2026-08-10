-- A configurable vertical / trade list for the EHS Talent Engine.
--
-- MODULE_ID: ehs_talent_engine
--
-- WHY
-- Steve's ask from the 2026-08-07 build review: the "vertical" on candidates
-- and job orders should be a dropdown of construction trades and safety
-- specialties (electrician, carpenter, solar, bridge, underground, general
-- construction, electrical safety) rather than a free-text field feeding a
-- single "construction" bucket. The list is data, not code — an admin extends
-- it in the Money floor panel without a deploy — so it lives on the
-- talent_settings singleton the module already treats as its configuration row.
--
-- The seed below is the meeting's list UNION whatever verticals are already on
-- candidate and job-order rows, deduplicated case-insensitively, so nothing in
-- use disappears from the picker the moment the dropdown ships.
--
-- No RLS changes: talent_settings already carries the module's read policy and
-- the admin-only update policy; a new column inherits both.
--
-- Rollback:
--   alter table public.talent_settings drop column if exists vertical_options;

alter table public.talent_settings
  add column if not exists vertical_options text[] not null
    default array[
      'Electrician',
      'Carpenter',
      'Solar',
      'Bridge',
      'Underground',
      'General Construction',
      'Electrical Safety'
    ];

comment on column public.talent_settings.vertical_options is
  'Trades / safety specialties offered by the vertical pickers on candidates and job orders. Admin-edited; order is display order.';

-- Fold the values already in use into the seeded list. `distinct on
-- (lower(...))` keeps one representative per case-insensitive value; ordinality
-- keeps the meeting's list in its decided order ahead of data-derived strays.
update public.talent_settings s
set vertical_options = (
  select coalesce(array_agg(v order by ord, v), s.vertical_options)
  from (
    select distinct on (lower(btrim(v))) btrim(v) as v, ord
    from (
      select d.v, d.ord::int as ord
        from unnest(s.vertical_options) with ordinality as d(v, ord)
      union all
      select cv.v, 1000
        from public.talent_candidates c, unnest(c.verticals) as cv(v)
      union all
      select j.vertical, 1001
        from public.talent_job_orders j
       where j.vertical is not null
    ) pool
    where btrim(v) <> ''
    order by lower(btrim(v)), ord
  ) merged
);
