begin;

create function public.update_grocery_receipt(
  p_id uuid,
  p_store text,
  p_purchased_on date,
  p_original jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_receipt public.receipts%rowtype;
  current_items jsonb;
begin
  select r.* into current_receipt
  from public.receipts r
  where r.id = p_id and r.user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  -- Lock item edits and compare the saved values before applying this draft.
  perform 1 from public.receipt_items where receipt_id = p_id for update;
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object(
    'item_name', i.item_name, 'quantity', i.quantity,
    'line_total_cents', i.line_total_cents, 'category', i.category
  )), '{}'::jsonb) into current_items
  from public.receipt_items i where i.receipt_id = p_id;

  if jsonb_build_object(
    'store', current_receipt.store,
    'purchased_on', current_receipt.purchased_on,
    'items', current_items
  ) is distinct from p_original then
    raise exception 'This receipt has changed. Reopen it before editing again.';
  end if;

  if nullif(btrim(p_store), '') is null or p_purchased_on is null then
    raise exception 'Enter a store and purchase date.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Provide a list of items.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(
      id text, item_name text, quantity numeric, line_total_cents integer, category text
    )
    where nullif(btrim(i.item_name), '') is null
      or i.quantity is null or i.quantity <= 0 or i.quantity = 'NaN'::numeric
      or i.line_total_cents is null
      or (i.id is not null and not (current_items ? i.id))
  ) or exists (
    select 1 from jsonb_to_recordset(p_items) as i(id text)
    where i.id is not null
    group by i.id having count(*) > 1
  ) then
    raise exception 'The receipt contains invalid items.';
  end if;

  update public.receipts
  set store = btrim(p_store), purchased_on = p_purchased_on
  where id = p_id;

  delete from public.receipt_items i
  where i.receipt_id = p_id and not exists (
    select 1 from jsonb_to_recordset(p_items) as draft(id text)
    where draft.id = i.id::text
  );

  update public.receipt_items i
  set item_name = btrim(draft.item_name),
      quantity = draft.quantity,
      line_total_cents = draft.line_total_cents,
      category = nullif(btrim(draft.category), '')
  from jsonb_to_recordset(p_items) as draft(
    id text, item_name text, quantity numeric, line_total_cents integer, category text
  )
  where i.receipt_id = p_id and i.id::text = draft.id
    and (i.item_name, i.quantity, i.line_total_cents, i.category) is distinct from
        (btrim(draft.item_name), draft.quantity, draft.line_total_cents, nullif(btrim(draft.category), ''));

  insert into public.receipt_items (receipt_id, item_name, quantity, line_total_cents, category)
  select p_id, btrim(draft.item_name), draft.quantity, draft.line_total_cents, nullif(btrim(draft.category), '')
  from jsonb_to_recordset(p_items) as draft(
    id text, item_name text, quantity numeric, line_total_cents integer, category text
  )
  where draft.id is null;
end;
$$;

create function public.delete_grocery_receipt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.receipts r
  where r.id = p_id and r.user_id = (select auth.uid())
  for update;

  -- Treat an already-deleted receipt as success so the request can be retried.
  if not found then
    return;
  end if;

  delete from public.receipt_items where receipt_id = p_id;
  delete from public.receipts where id = p_id;
end;
$$;

revoke all on function public.update_grocery_receipt(uuid, text, date, jsonb, jsonb) from public, anon;
revoke all on function public.delete_grocery_receipt(uuid) from public, anon;
grant execute on function public.update_grocery_receipt(uuid, text, date, jsonb, jsonb) to authenticated;
grant execute on function public.delete_grocery_receipt(uuid) to authenticated;

commit;
