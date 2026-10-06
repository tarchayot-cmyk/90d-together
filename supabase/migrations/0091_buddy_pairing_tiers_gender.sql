-- Buddy pairing v2: 4 activity tiers, pair same/adjacent tier only, same gender by default,
-- leftovers (odd head-count or unavoidable cross-gender pairs) become groups of 3.

create or replace function public.buddy_gender_cost(g1 text, m1 boolean, g2 text, m2 boolean)
returns float8
language sql
immutable
as $$
  select case when g1 is not null and g2 is not null and g1 = g2 then 0::float8
              when m1 and m2 then 1::float8
              else 30::float8 end
$$;

create or replace function public.buddy_pair_cost(tier1 int, tier2 int, prev int, g1 text, m1 boolean, g2 text, m2 boolean)
returns float8
language sql
immutable
as $$
  select (case when abs(tier1 - tier2) <= 1 then 0 else (abs(tier1 - tier2) - 1) * 6 end)::float8
         + prev * 8 + public.buddy_gender_cost(g1, m1, g2, m2)
$$;

create or replace function public.admin_preview_buddy_round()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign campaigns%rowtype;
  v_latest buddy_rounds%rowtype;
  v_ids uuid[]; v_scores float8[]; v_gender text[]; v_mixed boolean[];
  v_n int; v_try int; v_i int; v_j int; v_r int;
  v_prev int[];
  v_ord int[]; v_tier int[]; v_perm int[]; v_used boolean[];
  v_grp int[]; v_ng int; v_left int[];
  v_p int; v_q int; v_bq int; v_c float8; v_bc float8; v_x int; v_bg int;
  v_cost float8; v_best_cost float8 := 1e12; v_best jsonb;
  v_rep int; v_best_rep int := 0;
  v_mixed_groups int; v_best_mixed int := 0; v_trios int; v_best_trios int := 0;
  v_unknown int;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then raise exception 'no_active_campaign'; end if;

  select * into v_latest from buddy_rounds where campaign_id = v_campaign.id order by round_no desc limit 1;
  if v_latest.id is not null and v_latest.locked_until > now() then
    raise exception 'round_locked';
  end if;

  -- engagement score = points in the last 14 days
  select array_agg(t.id order by t.score desc, t.id),
         array_agg(t.score::float8 order by t.score desc, t.id),
         array_agg(t.gender order by t.score desc, t.id),
         array_agg((t.gender is null or t.cross_ok) order by t.score desc, t.id)
    into v_ids, v_scores, v_gender, v_mixed
  from (
    select m.id, m.gender, m.allow_cross_gender_buddy as cross_ok,
           (select coalesce(sum(pt.points), 0) from points_transactions pt
             where pt.member_id = m.id and pt.created_at >= now() - interval '14 days') as score
    from members m
    where m.is_active = true and m.role = 'participant'
  ) t;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 2 then raise exception 'not_enough_members'; end if;
  select count(*) into v_unknown from unnest(v_gender) g where g is null;

  -- who was together before (0/1 matrix, computed once)
  v_prev := array_fill(0, array[v_n, v_n]);
  for v_i in 1..v_n - 1 loop
    for v_j in v_i + 1..v_n loop
      if buddy_prev_together(v_ids[v_i], v_ids[v_j]) then
        v_prev[v_i][v_j] := 1; v_prev[v_j][v_i] := 1;
      end if;
    end loop;
  end loop;

  for v_try in 1..150 loop
    -- noisy ranking -> 4 tiers (tier boundaries move a little each roll)
    select array_agg(i order by (v_scores[i] + 1) * (0.6 + 0.8 * random()) + random()) into v_ord
      from generate_series(1, v_n) i;
    v_tier := array_fill(1, array[v_n]);
    for v_r in 1..v_n loop
      v_tier[v_ord[v_r]] := ceil(v_r * 4.0 / v_n)::int;
    end loop;

    select array_agg(i order by random()) into v_perm from generate_series(1, v_n) i;
    v_used := array_fill(false, array[v_n]);
    v_grp := array_fill(0, array[v_n]);
    v_ng := 0;
    v_left := '{}';

    foreach v_p in array v_perm loop
      continue when v_used[v_p];
      v_used[v_p] := true;
      v_bq := 0; v_bc := 1e12;
      for v_q in 1..v_n loop
        if not v_used[v_q] then
          v_c := buddy_pair_cost(v_tier[v_p], v_tier[v_q], v_prev[v_p][v_q],
                                 v_gender[v_p], v_mixed[v_p], v_gender[v_q], v_mixed[v_q]) + random() * 0.6;
          if v_c < v_bc then v_bc := v_c; v_bq := v_q; end if;
        end if;
      end loop;

      if v_bq = 0 then
        v_left := v_left || v_p;
      elsif buddy_gender_cost(v_gender[v_p], v_mixed[v_p], v_gender[v_bq], v_mixed[v_bq]) >= 30 then
        -- cross-gender without consent: do not pair, both join a trio instead
        v_used[v_bq] := true;
        v_left := v_left || v_p || v_bq;
      else
        v_used[v_bq] := true;
        v_ng := v_ng + 1;
        v_grp[v_p] := v_ng; v_grp[v_bq] := v_ng;
      end if;
    end loop;

    -- nothing to join (tiny head-count): pair the first two leftovers
    if v_ng = 0 and coalesce(array_length(v_left, 1), 0) >= 2 then
      v_ng := 1;
      v_grp[v_left[1]] := 1; v_grp[v_left[2]] := 1;
      v_left := v_left[3:coalesce(array_length(v_left, 1), 2)];
    end if;

    -- each leftover joins the best-fitting group (same gender, near tier, not met before)
    if coalesce(array_length(v_left, 1), 0) > 0 and v_ng > 0 then
      foreach v_x in array v_left loop
        v_bg := 0; v_bc := 1e12;
        for v_j in 1..v_ng loop
          v_c := 0;
          for v_q in 1..v_n loop
            if v_grp[v_q] = v_j then
              v_c := v_c + buddy_pair_cost(v_tier[v_x], v_tier[v_q], v_prev[v_x][v_q],
                                           v_gender[v_x], v_mixed[v_x], v_gender[v_q], v_mixed[v_q]);
            end if;
          end loop;
          -- strongly prefer groups still of size 2
          v_c := v_c + 50 * ((select count(*) from unnest(v_grp) g where g = v_j) - 2) + random() * 0.6;
          if v_c < v_bc then v_bc := v_c; v_bg := v_j; end if;
        end loop;
        v_grp[v_x] := v_bg;
      end loop;
    end if;

    -- total cost, repeat count, mixed-gender and trio counts
    v_cost := 0; v_rep := 0;
    for v_i in 1..v_n - 1 loop
      for v_j in v_i + 1..v_n loop
        if v_grp[v_i] > 0 and v_grp[v_i] = v_grp[v_j] then
          v_cost := v_cost + buddy_pair_cost(v_tier[v_i], v_tier[v_j], v_prev[v_i][v_j],
                                             v_gender[v_i], v_mixed[v_i], v_gender[v_j], v_mixed[v_j]);
          v_rep := v_rep + v_prev[v_i][v_j];
        end if;
      end loop;
    end loop;

    if v_cost < v_best_cost then
      v_best_cost := v_cost;
      v_best_rep := v_rep;
      select count(*) into v_trios from (
        select g from unnest(v_grp) g where g > 0 group by g having count(*) >= 3) z;
      v_best_trios := v_trios;
      select count(*) into v_mixed_groups from (
        select j from generate_series(1, v_ng) j
        where (select count(distinct v_gender[q]) from generate_series(1, v_n) q where v_grp[q] = j and v_gender[q] is not null) > 1) z;
      v_best_mixed := v_mixed_groups;
      select coalesce(jsonb_agg(ids order by j), '[]'::jsonb) into v_best from (
        select j, (select jsonb_agg(to_jsonb(v_ids[q])) from generate_series(1, v_n) q where v_grp[q] = j) as ids
        from generate_series(1, v_ng) j) z
        where ids is not null;
    end if;
  end loop;

  return jsonb_build_object(
    'round_no', coalesce(v_latest.round_no, 0) + 1,
    'repeat_pairs', v_best_rep,
    'trios', v_best_trios,
    'mixed_gender_groups', v_best_mixed,
    'unknown_gender', v_unknown,
    'groups', (
      select jsonb_agg(jsonb_build_object(
        'name', 'Buddy ' || g.ord,
        'members', (
          select jsonb_agg(jsonb_build_object(
            'id', mm.id, 'full_name', mm.full_name, 'gender', mm.gender,
            'score', coalesce((select sum(points) from points_transactions pt
                               where pt.member_id = mm.id and pt.created_at >= now() - interval '14 days'), 0))
            order by mm.full_name)
          from members mm
          where mm.id in (select (jsonb_array_elements_text(g.ids))::uuid)
        )
      ) order by g.ord)
      from (select ids, row_number() over () as ord
            from jsonb_array_elements(v_best) as t(ids)) g
    )
  );
end;
$$;
