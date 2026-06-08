-- Atomic increment of an expense's Slack notification count.
--
-- The notify route previously did a read-modify-write (SELECT count, then
-- UPDATE count + 1), which loses an increment when two notifications for the
-- same expense run concurrently. This function performs the increment in a
-- single statement so concurrent sends can't clobber each other.
--
-- Apply in the Supabase SQL editor (or via `supabase db push`). The notify route
-- calls this via rpc('increment_slack_notification_count') and falls back to the
-- old non-atomic update if the function is missing, so deploy order is flexible.
create or replace function increment_slack_notification_count(p_expense_id uuid)
returns void
language sql
as $$
  update expenses
  set slack_notification_count = coalesce(slack_notification_count, 0) + 1,
      slack_last_notified_at = now()
  where id = p_expense_id;
$$;
