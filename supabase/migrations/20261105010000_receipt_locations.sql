begin;

alter table public.receipts
  add column latitude double precision,
  add column longitude double precision,
  add constraint receipt_location_pair check (
    (latitude is null and longitude is null)
    or (
      latitude is not null and longitude is not null
      and latitude between -85 and 85
      and longitude between -180 and 180
    )
  );

commit;
