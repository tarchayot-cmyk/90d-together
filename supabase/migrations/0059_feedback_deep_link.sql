-- Same signature as before (p_feedback_id uuid, p_reply text) — no
-- DROP needed. Only change: the notification now links to
-- /profile?feedback=<id> instead of a bare /profile, so tapping it
-- opens straight to that question instead of just the profile page.
create or replace function admin_reply_feedback(p_feedback_id uuid, p_reply text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_feedback feedback_messages%rowtype;
begin
  if not exists (select 1 from members where id = auth_member_id() and role in ('admin', 'super_admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_reply is null or trim(p_reply) = '' then
    raise exception 'reply_required';
  end if;

  select * into v_feedback from feedback_messages where id = p_feedback_id;
  if v_feedback.id is null then
    raise exception 'feedback_not_found';
  end if;

  update feedback_messages set
    admin_reply = trim(p_reply),
    status = 'replied',
    replied_by = v_admin_id,
    replied_at = now()
  where id = p_feedback_id;

  begin
    perform create_notification(
      v_feedback.member_id,
      'feedback_replied',
      'แอดมินตอบกลับคำถาม/ข้อเสนอแนะของคุณแล้ว',
      '/profile?feedback=' || p_feedback_id,
      jsonb_build_object('feedback_id', p_feedback_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;
