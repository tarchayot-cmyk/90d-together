-- ============================================================
-- Member -> Admin feedback / question system.
-- Member submits a message, all admins get notified, an admin
-- replies, the member gets notified back. Simple single-reply
-- thread (not a full multi-message chat) — matches "สอบถามแอดมิน/
-- ข้อเสนอแนะ" as a lightweight one-shot Q&A, not a live chat.
-- ============================================================

create table feedback_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open', 'replied')),
  admin_reply text,
  replied_by uuid references members (id),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

alter table feedback_messages enable row level security;

create policy "feedback_select_own_or_admin" on feedback_messages
for select to authenticated
using (
  member_id = auth_member_id()
  or exists (select 1 from members where id = auth_member_id() and role in ('admin', 'super_admin'))
);

-- No direct insert/update — all writes go through the RPCs below
-- (SECURITY DEFINER), same pattern as every other table in this app.
revoke insert, update, delete on feedback_messages from authenticated;

-- ------------------------------------------------------------
-- Member submits a question/feedback. Notifies every admin.
-- ------------------------------------------------------------
create or replace function submit_feedback(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_name text;
  v_feedback_id uuid;
  v_admin record;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_message is null or trim(p_message) = '' then
    raise exception 'message_required';
  end if;

  select full_name into v_member_name from members where id = v_member_id;

  insert into feedback_messages (member_id, message)
  values (v_member_id, trim(p_message))
  returning id into v_feedback_id;

  for v_admin in select id from members where role in ('admin', 'super_admin') and is_active = true loop
    begin
      perform create_notification(
        v_admin.id,
        'feedback_submitted',
        v_member_name || ' ส่งคำถาม/ข้อเสนอแนะมาใหม่',
        '/admin/feedback',
        jsonb_build_object('feedback_id', v_feedback_id)
      );
    exception when others then
      null; -- one admin's notification failing shouldn't block the others
    end;
  end loop;

  return jsonb_build_object('success', true, 'feedback_id', v_feedback_id);
end;
$$;

grant execute on function submit_feedback(text) to authenticated;

-- ------------------------------------------------------------
-- Admin replies. Notifies the original member.
-- ------------------------------------------------------------
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
      '/profile',
      jsonb_build_object('feedback_id', p_feedback_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_reply_feedback(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Member's own feedback history (for the Profile page).
-- ------------------------------------------------------------
create or replace function get_my_feedback()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  return (
    select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', f.id,
        'message', f.message,
        'status', f.status,
        'admin_reply', f.admin_reply,
        'replied_at', f.replied_at,
        'created_at', f.created_at
      ) as row_data
      from feedback_messages f
      where f.member_id = v_member_id
    ) sub
  );
end;
$$;

grant execute on function get_my_feedback() to authenticated;

-- ------------------------------------------------------------
-- Admin's full list (for /admin/feedback).
-- ------------------------------------------------------------
create or replace function admin_list_feedback()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from members where id = auth_member_id() and role in ('admin', 'super_admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', f.id,
        'member_id', f.member_id,
        'member_name', m.full_name,
        'employee_code', m.employee_code,
        'message', f.message,
        'status', f.status,
        'admin_reply', f.admin_reply,
        'replied_at', f.replied_at,
        'created_at', f.created_at
      ) as row_data
      from feedback_messages f
      join members m on m.id = f.member_id
    ) sub
  );
end;
$$;

grant execute on function admin_list_feedback() to authenticated;
