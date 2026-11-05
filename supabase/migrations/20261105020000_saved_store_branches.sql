begin;

create table public.store_branches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store text not null check (char_length(btrim(store)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 500),
  source_address text not null default '',
  latitude double precision not null check (latitude between -85 and 85),
  longitude double precision not null check (longitude between -180 and 180),
  store_key text generated always as (lower(regexp_replace(store, '[^[:alnum:]]', '', 'g'))) stored,
  address_key text generated always as (lower(regexp_replace(address, '[^[:alnum:]]', '', 'g'))) stored,
  unique (user_id, id),
  unique (user_id, store_key, address_key)
);

alter table public.store_branches enable row level security;
revoke all on public.store_branches from public, anon;
grant select, insert on public.store_branches to authenticated;

create policy "Users read their own store branches"
on public.store_branches for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users create their own store branches"
on public.store_branches for insert to authenticated
with check (user_id = (select auth.uid()));

alter table public.receipts
  add column store_branch_id uuid,
  add constraint receipt_branch_owner
    foreign key (user_id, store_branch_id) references public.store_branches(user_id, id);

create function public.save_grocery_receipt_at_branch(
  p_store text,
  p_purchased_on date,
  p_items jsonb,
  p_branch jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  branch_id uuid;
  receipt_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving.';
  end if;

  if p_branch is not null and p_branch <> 'null'::jsonb then
    if p_branch ->> 'id' is not null then
      select id into branch_id from public.store_branches
      where id = (p_branch ->> 'id')::uuid and user_id = auth.uid()
        and store_key = lower(regexp_replace(p_store, '[^[:alnum:]]', '', 'g'));

      if branch_id is null then
        raise exception 'Choose a saved branch for this store.';
      end if;
    else
      insert into public.store_branches (store, address, source_address, latitude, longitude)
      values (
        btrim(p_store), btrim(p_branch ->> 'address'),
        coalesce(p_branch ->> 'source_address', ''),
        (p_branch ->> 'latitude')::double precision, (p_branch ->> 'longitude')::double precision
      )
      on conflict (user_id, store_key, address_key) do nothing
      returning id into branch_id;

      if branch_id is null then
        select id into branch_id from public.store_branches
        where user_id = auth.uid()
          and store_key = lower(regexp_replace(p_store, '[^[:alnum:]]', '', 'g'))
          and address_key = lower(regexp_replace(p_branch ->> 'address', '[^[:alnum:]]', '', 'g'));
      end if;
    end if;
  end if;

  receipt_id := public.save_grocery_receipt(p_store, p_purchased_on, p_items);

  update public.receipts set store_branch_id = branch_id where id = receipt_id;
  return receipt_id;
end;
$$;

revoke all on function public.save_grocery_receipt_at_branch(text, date, jsonb, jsonb) from public, anon;
grant execute on function public.save_grocery_receipt_at_branch(text, date, jsonb, jsonb) to authenticated;

commit;
