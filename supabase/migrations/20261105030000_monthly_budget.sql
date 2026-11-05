begin;

-- One optional monthly grocery budget per user, in cents.
create table public.grocery_budgets (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_cents integer not null check (monthly_cents between 0 and 100000000),
  updated_at timestamptz not null default now()
);

alter table public.grocery_budgets enable row level security;
revoke all on public.grocery_budgets from public, anon;
grant select, insert, update on public.grocery_budgets to authenticated;

create policy "Users read their own budget"
on public.grocery_budgets for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users create their own budget"
on public.grocery_budgets for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users update their own budget"
on public.grocery_budgets for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

commit;
