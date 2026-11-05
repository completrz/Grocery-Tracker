begin;

alter table public.receipt_items
  add column category text
  check (category is null or char_length(btrim(category)) between 1 and 64);

create table public.receipt_category_rules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_key text not null,
  item_key text not null,
  category text not null check (char_length(btrim(category)) between 1 and 64),
  primary key (user_id, store_key, item_key)
);

alter table public.receipt_category_rules enable row level security;
revoke all on public.receipt_category_rules from public, anon;
grant select, insert, update on public.receipt_category_rules to authenticated;

create policy "Users manage their own receipt category rules"
on public.receipt_category_rules for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create function public.remember_receipt_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.category is not null then
    insert into public.receipt_category_rules (user_id, store_key, item_key, category)
    select
      r.user_id,
      lower(btrim(regexp_replace(r.store, '[[:space:]]+', ' ', 'g'))),
      lower(btrim(regexp_replace(new.item_name, '[[:space:]]+', ' ', 'g'))),
      btrim(new.category)
    from public.receipts r
    where r.id = new.receipt_id
      and r.user_id = (select auth.uid())
    on conflict (user_id, store_key, item_key)
    do update set category = excluded.category;
  end if;

  return new;
end;
$$;

create trigger remember_receipt_category
after insert or update of category on public.receipt_items
for each row execute function public.remember_receipt_category();

create or replace function public.save_grocery_receipt(
  p_store text,
  p_purchased_on date,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_receipt_id uuid;
begin
  if nullif(trim(p_store), '') is null or p_purchased_on is null then
    raise exception 'Enter a store and purchase date.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Provide a list of items.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item.';
  end if;

  insert into public.receipts (store, purchased_on)
  values (trim(p_store), p_purchased_on)
  returning id into new_receipt_id;

  insert into public.receipt_items (
    receipt_id, item_name, quantity, line_total_cents, category
  )
  select new_receipt_id, trim(item.item_name), item.quantity,
         item.line_total_cents, nullif(trim(item.category), '')
  from jsonb_to_recordset(p_items) as item(
    item_name text,
    quantity numeric,
    line_total_cents integer,
    category text
  );

  return new_receipt_id;
end;
$$;

revoke all on function public.save_grocery_receipt(text, date, jsonb) from public, anon;
grant execute on function public.save_grocery_receipt(text, date, jsonb) to authenticated;

commit;
