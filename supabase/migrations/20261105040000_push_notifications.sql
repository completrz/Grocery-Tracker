begin;

-- One row per browser or device that has turned on notifications.
-- The endpoint must belong to a known push service, so the server can never be pointed at an arbitrary URL.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) between 10 and 2000 and
    endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  ),
  p256dh text not null check (char_length(p256dh) between 10 and 300),
  auth text not null check (char_length(auth) between 10 and 100),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon;
grant select, insert, delete on public.push_subscriptions to authenticated;

create policy "Users read their own push subscriptions"
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users create their own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users delete their own push subscriptions"
on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

-- Which notifications a user wants, and their time zone so messages arrive at 10am local time.
create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  weekly_summary boolean not null default true,
  budget_alerts boolean not null default true,
  reminders boolean not null default true,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from public, anon;
grant select, insert, update on public.notification_settings to authenticated;

create policy "Users read their own notification settings"
on public.notification_settings for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users create their own notification settings"
on public.notification_settings for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users update their own notification settings"
on public.notification_settings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- What has already been sent, so the scheduled job never repeats itself. Only the server (service role) can use it.
create table public.notification_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  period text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

alter table public.notification_log enable row level security;
revoke all on public.notification_log from public, anon, authenticated;

commit;
