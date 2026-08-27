-- Per-expense Slack notification history: what was actually requested each
-- time (corrections, message, recipients), not just a count. Lets the notify
-- modal prefill follow-ups so repeat nudges don't require retyping.
-- Run once in the Supabase SQL editor.

create table if not exists expense_notifications (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  sent_by text not null,
  sent_at timestamptz not null default now(),
  send_mode text not null default 'dm',        -- dm | group | channel
  channel_id text,
  additional_slack_ids text[],
  correct_branch text,
  correct_department text,
  correct_category text,
  improve_description boolean not null default false,
  additional_message text,
  slack_message_ts text
);

create index if not exists idx_expense_notifications_expense
  on expense_notifications (expense_id, sent_at desc);
