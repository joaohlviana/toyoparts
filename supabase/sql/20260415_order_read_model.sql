create table if not exists public.order_summaries_1d6e33e0 (
  record_kind text not null check (record_kind in ('store_order', 'magento_stored_order')),
  source_id text not null,
  summary_key text not null,
  source_key text not null,
  sort_key timestamptz not null,
  order_id text,
  entity_id bigint,
  increment_id text,
  created_at timestamptz not null,
  updated_at timestamptz,
  payment_provider text,
  payment_status text,
  fulfillment_status text,
  total_amount numeric(14,2),
  shipping_carrier text,
  shipping_service text,
  tracking_code text,
  customer_name text,
  customer_email text,
  customer_firstname text,
  customer_lastname text,
  currency_code text,
  status text,
  asaas_invoice_url text,
  vindi_url text,
  stripe_checkout_url text,
  updated_from_source_at timestamptz not null default now(),
  primary key (record_kind, source_id)
);

create index if not exists idx_order_summaries_kind_sort_1d6e33e0
  on public.order_summaries_1d6e33e0 (record_kind, sort_key desc, source_id desc);

create index if not exists idx_order_summaries_kind_payment_sort_1d6e33e0
  on public.order_summaries_1d6e33e0 (record_kind, payment_status, sort_key desc)
  where record_kind = 'store_order';

create index if not exists idx_order_summaries_kind_fulfillment_sort_1d6e33e0
  on public.order_summaries_1d6e33e0 (record_kind, fulfillment_status, sort_key desc)
  where record_kind = 'store_order';

create index if not exists idx_order_summaries_order_id_1d6e33e0
  on public.order_summaries_1d6e33e0 (order_id);

create index if not exists idx_order_summaries_increment_id_1d6e33e0
  on public.order_summaries_1d6e33e0 (increment_id);

create index if not exists idx_order_summaries_customer_email_1d6e33e0
  on public.order_summaries_1d6e33e0 ((lower(customer_email)));

create table if not exists public.order_read_model_meta_1d6e33e0 (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.try_timestamptz_1d6e33e0(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return '1970-01-01T00:00:00Z'::timestamptz;
  end if;
  return value::timestamptz;
exception
  when others then
    return '1970-01-01T00:00:00Z'::timestamptz;
end;
$$;

create or replace function public.try_numeric_1d6e33e0(value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::numeric;
exception
  when others then
    return null;
end;
$$;

create or replace function public.order_source_page_1d6e33e0(
  p_page integer default 1,
  p_limit integer default 100,
  p_search text default null,
  p_payment_status text default null,
  p_fulfillment_status text default null
)
returns jsonb
language sql
stable
as $$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    greatest(least(coalesce(p_limit, 100), 1000), 1) as lim,
    nullif(lower(btrim(coalesce(p_search, ''))), '') as search_term,
    nullif(btrim(coalesce(p_payment_status, '')), '') as payment_status_filter,
    nullif(btrim(coalesce(p_fulfillment_status, '')), '') as fulfillment_status_filter
),
base as (
  select
    key,
    value,
    coalesce(nullif(value->>'orderId', ''), nullif(value->>'id', '')) as source_id,
    public.try_timestamptz_1d6e33e0(coalesce(value->>'createdAt', value->>'created_at', value->>'updatedAt', value->>'updated_at')) as created_at_ts,
    lower(coalesce(value->>'payment_status', value->>'status', 'waiting_payment')) as payment_status_norm,
    lower(coalesce(value->>'fulfillment_status', 'pending')) as fulfillment_status_norm,
    lower(coalesce(value->>'tracking_code', '')) as tracking_code_norm,
    lower(coalesce(value->'customer'->>'name', '')) as customer_name_norm,
    lower(coalesce(value->'customer'->>'email', '')) as customer_email_norm
  from public.kv_store_1d6e33e0
  where key >= 'order:' and key < 'order;'
    and coalesce(nullif(value->>'orderId', ''), nullif(value->>'id', '')) is not null
),
filtered as (
  select b.*
  from base b
  cross join params p
  where (p.search_term is null
    or lower(b.source_id) like '%' || p.search_term || '%'
    or b.customer_name_norm like '%' || p.search_term || '%'
    or b.customer_email_norm like '%' || p.search_term || '%'
    or b.tracking_code_norm like '%' || p.search_term || '%')
    and (p.payment_status_filter is null or b.payment_status_norm = lower(p.payment_status_filter))
    and (p.fulfillment_status_filter is null or b.fulfillment_status_norm = lower(p.fulfillment_status_filter))
),
counted as (
  select count(*)::integer as total from filtered
),
paged as (
  select key, value, created_at_ts
  from filtered
  order by created_at_ts desc, key desc
  offset ((select page from params) - 1) * (select lim from params)
  limit (select lim from params)
)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(value order by created_at_ts desc, key desc) from paged), '[]'::jsonb),
  'total', (select total from counted),
  'page', (select page from params),
  'limit', (select lim from params),
  'has_more', ((((select page from params) - 1) * (select lim from params)) + (select count(*) from paged)) < (select total from counted)
);
$$;

create or replace function public.magento_order_source_page_1d6e33e0(
  p_page integer default 1,
  p_limit integer default 20,
  p_search text default null
)
returns jsonb
language sql
stable
as $$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    greatest(least(coalesce(p_limit, 20), 1000), 1) as lim,
    nullif(lower(btrim(coalesce(p_search, ''))), '') as search_term
),
raw_source as (
  select
    1 as source_priority,
    key,
    value,
    coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) as source_id,
    public.try_timestamptz_1d6e33e0(coalesce(value->>'created_at', value->>'createdAt', value->>'updated_at', value->>'updatedAt')) as created_at_ts,
    lower(coalesce(value->>'increment_id', '')) as increment_id_norm,
    lower(coalesce(value->>'customer_email', '')) as customer_email_norm,
    lower(trim(coalesce(value->>'customer_firstname', '') || ' ' || coalesce(value->>'customer_lastname', ''))) as customer_name_norm,
    lower(coalesce(value->>'status', '')) as status_norm
  from public.kv_store_1d6e33e0
  where key >= 'magento_order:' and key < 'magento_order;'
    and coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) is not null
),
legacy_source as (
  select
    2 as source_priority,
    key,
    value,
    coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) as source_id,
    public.try_timestamptz_1d6e33e0(coalesce(value->>'created_at', value->>'createdAt', value->>'updated_at', value->>'updatedAt')) as created_at_ts,
    lower(coalesce(value->>'increment_id', '')) as increment_id_norm,
    lower(coalesce(value->>'customer_email', '')) as customer_email_norm,
    lower(trim(coalesce(value->>'customer_firstname', '') || ' ' || coalesce(value->>'customer_lastname', ''))) as customer_name_norm,
    lower(coalesce(value->>'status', '')) as status_norm
  from public.kv_store_1d6e33e0
  where key >= 'order:' and key < 'order;'
    and coalesce(nullif(value->>'orderId', ''), nullif(value->>'id', '')) is null
    and coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) is not null
    and (
      nullif(value->>'customer_email', '') is not null
      or nullif(value->>'created_at', '') is not null
      or nullif(value->>'status', '') is not null
    )
),
deduped as (
  select *
  from (
    select
      s.*,
      row_number() over (partition by s.source_id order by s.source_priority asc, s.created_at_ts desc, s.key desc) as rn
    from (
      select * from raw_source
      union all
      select * from legacy_source
    ) s
  ) ranked
  where rn = 1
),
filtered as (
  select d.*
  from deduped d
  cross join params p
  where p.search_term is null
    or d.increment_id_norm like '%' || p.search_term || '%'
    or d.customer_email_norm like '%' || p.search_term || '%'
    or d.customer_name_norm like '%' || p.search_term || '%'
    or d.status_norm like '%' || p.search_term || '%'
    or lower(d.source_id) like '%' || p.search_term || '%'
),
counted as (
  select count(*)::integer as total from filtered
),
paged as (
  select key, value, created_at_ts
  from filtered
  order by created_at_ts desc, key desc
  offset ((select page from params) - 1) * (select lim from params)
  limit (select lim from params)
)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(value order by created_at_ts desc, key desc) from paged), '[]'::jsonb),
  'total', (select total from counted),
  'page', (select page from params),
  'limit', (select lim from params),
  'has_more', ((((select page from params) - 1) * (select lim from params)) + (select count(*) from paged)) < (select total from counted)
);
$$;

create or replace function public.order_read_model_rebuild_batch_1d6e33e0(
  p_batch_size integer default 200,
  p_reset boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_epoch constant timestamptz := '1970-01-01T00:00:00Z'::timestamptz;
  v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 200), 1000));
  v_state jsonb;
  v_order_cursor text;
  v_magento_cursor text;
  v_order_done boolean;
  v_magento_done boolean;
  v_processed_order_entries integer;
  v_processed_magento_entries integer;
  v_upserted_store_orders integer;
  v_upserted_magento_orders integer;
  v_phase text;
  v_batch_count integer;
  v_store_batch_upserts integer;
  v_magento_batch_upserts integer;
  v_last_key text;
begin
  if p_reset then
    v_state := null;
  else
    select value into v_state
    from public.order_read_model_meta_1d6e33e0
    where key = 'meta:orders_read_model_rebuild_state';
  end if;

  if v_state is null then
    v_state := jsonb_build_object(
      'started_at', to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updated_at', to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'completed_at', null,
      'batch_size', v_batch_size,
      'phase', 'initialized',
      'last_error', null,
      'order_offset', 0,
      'magento_offset', 0,
      'order_cursor_key', null,
      'magento_cursor_key', null,
      'order_done', false,
      'magento_done', false,
      'processed_order_entries', 0,
      'processed_magento_entries', 0,
      'upserted_store_orders', 0,
      'upserted_magento_orders', 0
    );
  end if;

  v_order_cursor := nullif(v_state->>'order_cursor_key', '');
  v_magento_cursor := nullif(v_state->>'magento_cursor_key', '');
  v_order_done := coalesce((v_state->>'order_done')::boolean, false);
  v_magento_done := coalesce((v_state->>'magento_done')::boolean, false);
  v_processed_order_entries := coalesce((v_state->>'processed_order_entries')::integer, 0);
  v_processed_magento_entries := coalesce((v_state->>'processed_magento_entries')::integer, 0);
  v_upserted_store_orders := coalesce((v_state->>'upserted_store_orders')::integer, 0);
  v_upserted_magento_orders := coalesce((v_state->>'upserted_magento_orders')::integer, 0);
  v_phase := coalesce(v_state->>'phase', 'initialized');

  if not v_order_done then
    v_phase := 'fetch_store_orders';

    with order_batch as (
      select key, value
      from public.kv_store_1d6e33e0
      where key >= 'order:' and key < 'order;'
        and (v_order_cursor is null or key > v_order_cursor)
      order by key asc
      limit v_batch_size
    ),
    upsert_store as (
      insert into public.order_summaries_1d6e33e0 (
        record_kind, source_id, summary_key, source_key, sort_key, order_id,
        entity_id, increment_id, created_at, updated_at, payment_provider,
        payment_status, fulfillment_status, total_amount, shipping_carrier,
        shipping_service, tracking_code, customer_name, customer_email,
        customer_firstname, customer_lastname, currency_code, status,
        asaas_invoice_url, vindi_url, stripe_checkout_url, updated_from_source_at
      )
      select
        'store_order',
        source_id,
        'store_order:' || encode(convert_to(source_id, 'UTF8'), 'escape'),
        key,
        created_at_ts,
        source_id,
        null,
        null,
        created_at_ts,
        public.try_timestamptz_1d6e33e0(coalesce(value->>'updatedAt', value->>'updated_at')),
        nullif(coalesce(value->>'payment_provider', 'asaas'), ''),
        nullif(coalesce(value->>'payment_status', value->>'status', 'waiting_payment'), ''),
        nullif(coalesce(value->>'fulfillment_status', 'pending'), ''),
        coalesce(public.try_numeric_1d6e33e0(value->'totals'->>'total'), 0),
        nullif(coalesce(value->'shipping'->>'carrier', value->>'carrier_name'), ''),
        nullif(value->'shipping'->>'service', ''),
        nullif(value->>'tracking_code', ''),
        nullif(value->'customer'->>'name', ''),
        nullif(lower(value->'customer'->>'email'), ''),
        null,
        null,
        'BRL',
        nullif(coalesce(value->>'payment_status', value->>'status', 'waiting_payment'), ''),
        nullif(value->>'asaas_invoice_url', ''),
        nullif(value->>'vindi_url', ''),
        nullif(value->>'stripe_checkout_url', ''),
        now()
      from (
        select
          key,
          value,
          coalesce(nullif(value->>'orderId', ''), nullif(value->>'id', '')) as source_id,
          public.try_timestamptz_1d6e33e0(coalesce(value->>'createdAt', value->>'created_at', value->>'updatedAt', value->>'updated_at')) as created_at_ts
        from order_batch
      ) prepared
      where source_id is not null
      on conflict (record_kind, source_id) do update set
        summary_key = excluded.summary_key,
        source_key = excluded.source_key,
        sort_key = excluded.sort_key,
        order_id = excluded.order_id,
        entity_id = excluded.entity_id,
        increment_id = excluded.increment_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payment_provider = excluded.payment_provider,
        payment_status = excluded.payment_status,
        fulfillment_status = excluded.fulfillment_status,
        total_amount = excluded.total_amount,
        shipping_carrier = excluded.shipping_carrier,
        shipping_service = excluded.shipping_service,
        tracking_code = excluded.tracking_code,
        customer_name = excluded.customer_name,
        customer_email = excluded.customer_email,
        customer_firstname = excluded.customer_firstname,
        customer_lastname = excluded.customer_lastname,
        currency_code = excluded.currency_code,
        status = excluded.status,
        asaas_invoice_url = excluded.asaas_invoice_url,
        vindi_url = excluded.vindi_url,
        stripe_checkout_url = excluded.stripe_checkout_url,
        updated_from_source_at = now()
      returning 1
    ),
    upsert_legacy_magento as (
      insert into public.order_summaries_1d6e33e0 (
        record_kind, source_id, summary_key, source_key, sort_key, order_id,
        entity_id, increment_id, created_at, updated_at, payment_provider,
        payment_status, fulfillment_status, total_amount, shipping_carrier,
        shipping_service, tracking_code, customer_name, customer_email,
        customer_firstname, customer_lastname, currency_code, status,
        asaas_invoice_url, vindi_url, stripe_checkout_url, updated_from_source_at
      )
      select
        'magento_stored_order',
        source_id,
        'magento_stored_order:' || encode(convert_to(source_id, 'UTF8'), 'escape'),
        key,
        created_at_ts,
        null,
        public.try_numeric_1d6e33e0(value->>'entity_id')::bigint,
        nullif(value->>'increment_id', ''),
        created_at_ts,
        public.try_timestamptz_1d6e33e0(coalesce(value->>'updatedAt', value->>'updated_at')),
        null,
        null,
        null,
        coalesce(public.try_numeric_1d6e33e0(value->>'grand_total'), 0),
        null,
        null,
        null,
        nullif(trim(coalesce(value->>'customer_firstname', '') || ' ' || coalesce(value->>'customer_lastname', '')), ''),
        nullif(lower(value->>'customer_email'), ''),
        nullif(value->>'customer_firstname', ''),
        nullif(value->>'customer_lastname', ''),
        nullif(coalesce(value->>'base_currency_code', 'BRL'), ''),
        nullif(value->>'status', ''),
        null,
        null,
        null,
        now()
      from (
        select
          key,
          value,
          coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) as source_id,
          public.try_timestamptz_1d6e33e0(coalesce(value->>'created_at', value->>'createdAt', value->>'updated_at', value->>'updatedAt')) as created_at_ts
        from order_batch
      ) prepared
      where source_id is not null
        and coalesce(nullif(value->>'orderId', ''), nullif(value->>'id', '')) is null
        and (
          nullif(value->>'customer_email', '') is not null
          or nullif(value->>'created_at', '') is not null
          or nullif(value->>'status', '') is not null
        )
      on conflict (record_kind, source_id) do update set
        summary_key = excluded.summary_key,
        source_key = excluded.source_key,
        sort_key = excluded.sort_key,
        order_id = excluded.order_id,
        entity_id = excluded.entity_id,
        increment_id = excluded.increment_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payment_provider = excluded.payment_provider,
        payment_status = excluded.payment_status,
        fulfillment_status = excluded.fulfillment_status,
        total_amount = excluded.total_amount,
        shipping_carrier = excluded.shipping_carrier,
        shipping_service = excluded.shipping_service,
        tracking_code = excluded.tracking_code,
        customer_name = excluded.customer_name,
        customer_email = excluded.customer_email,
        customer_firstname = excluded.customer_firstname,
        customer_lastname = excluded.customer_lastname,
        currency_code = excluded.currency_code,
        status = excluded.status,
        asaas_invoice_url = excluded.asaas_invoice_url,
        vindi_url = excluded.vindi_url,
        stripe_checkout_url = excluded.stripe_checkout_url,
        updated_from_source_at = now()
      returning 1
    )
    select
      coalesce((select count(*) from order_batch), 0),
      coalesce((select count(*) from upsert_store), 0),
      coalesce((select count(*) from upsert_legacy_magento), 0),
      (select max(key) from order_batch)
    into v_batch_count, v_store_batch_upserts, v_magento_batch_upserts, v_last_key;

    v_processed_order_entries := v_processed_order_entries + coalesce(v_batch_count, 0);
    v_upserted_store_orders := v_upserted_store_orders + coalesce(v_store_batch_upserts, 0);
    v_upserted_magento_orders := v_upserted_magento_orders + coalesce(v_magento_batch_upserts, 0);
    v_order_cursor := coalesce(v_last_key, v_order_cursor);
    v_order_done := coalesce(v_batch_count, 0) < v_batch_size;
    v_phase := case when v_order_done then 'store_orders_completed' else 'store_orders_progress' end;
  end if;

  if not v_magento_done then
    v_phase := 'fetch_magento_orders';

    with magento_batch as (
      select key, value
      from public.kv_store_1d6e33e0
      where key >= 'magento_order:' and key < 'magento_order;'
        and (v_magento_cursor is null or key > v_magento_cursor)
      order by key asc
      limit v_batch_size
    ),
    upsert_magento as (
      insert into public.order_summaries_1d6e33e0 (
        record_kind, source_id, summary_key, source_key, sort_key, order_id,
        entity_id, increment_id, created_at, updated_at, payment_provider,
        payment_status, fulfillment_status, total_amount, shipping_carrier,
        shipping_service, tracking_code, customer_name, customer_email,
        customer_firstname, customer_lastname, currency_code, status,
        asaas_invoice_url, vindi_url, stripe_checkout_url, updated_from_source_at
      )
      select
        'magento_stored_order',
        source_id,
        'magento_stored_order:' || encode(convert_to(source_id, 'UTF8'), 'escape'),
        key,
        created_at_ts,
        null,
        public.try_numeric_1d6e33e0(value->>'entity_id')::bigint,
        nullif(value->>'increment_id', ''),
        created_at_ts,
        public.try_timestamptz_1d6e33e0(coalesce(value->>'updatedAt', value->>'updated_at')),
        null,
        null,
        null,
        coalesce(public.try_numeric_1d6e33e0(value->>'grand_total'), 0),
        null,
        null,
        null,
        nullif(trim(coalesce(value->>'customer_firstname', '') || ' ' || coalesce(value->>'customer_lastname', '')), ''),
        nullif(lower(value->>'customer_email'), ''),
        nullif(value->>'customer_firstname', ''),
        nullif(value->>'customer_lastname', ''),
        nullif(coalesce(value->>'base_currency_code', 'BRL'), ''),
        nullif(value->>'status', ''),
        null,
        null,
        null,
        now()
      from (
        select
          key,
          value,
          coalesce(nullif(value->>'entity_id', ''), nullif(value->>'increment_id', ''), nullif(value->>'reserved_order_id', '')) as source_id,
          public.try_timestamptz_1d6e33e0(coalesce(value->>'created_at', value->>'createdAt', value->>'updated_at', value->>'updatedAt')) as created_at_ts
        from magento_batch
      ) prepared
      where source_id is not null
      on conflict (record_kind, source_id) do update set
        summary_key = excluded.summary_key,
        source_key = excluded.source_key,
        sort_key = excluded.sort_key,
        order_id = excluded.order_id,
        entity_id = excluded.entity_id,
        increment_id = excluded.increment_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payment_provider = excluded.payment_provider,
        payment_status = excluded.payment_status,
        fulfillment_status = excluded.fulfillment_status,
        total_amount = excluded.total_amount,
        shipping_carrier = excluded.shipping_carrier,
        shipping_service = excluded.shipping_service,
        tracking_code = excluded.tracking_code,
        customer_name = excluded.customer_name,
        customer_email = excluded.customer_email,
        customer_firstname = excluded.customer_firstname,
        customer_lastname = excluded.customer_lastname,
        currency_code = excluded.currency_code,
        status = excluded.status,
        asaas_invoice_url = excluded.asaas_invoice_url,
        vindi_url = excluded.vindi_url,
        stripe_checkout_url = excluded.stripe_checkout_url,
        updated_from_source_at = now()
      returning 1
    )
    select
      coalesce((select count(*) from magento_batch), 0),
      coalesce((select count(*) from upsert_magento), 0),
      (select max(key) from magento_batch)
    into v_batch_count, v_magento_batch_upserts, v_last_key;

    v_processed_magento_entries := v_processed_magento_entries + coalesce(v_batch_count, 0);
    v_upserted_magento_orders := v_upserted_magento_orders + coalesce(v_magento_batch_upserts, 0);
    v_magento_cursor := coalesce(v_last_key, v_magento_cursor);
    v_magento_done := coalesce(v_batch_count, 0) < v_batch_size;
    v_phase := case when v_magento_done then 'magento_orders_completed' else 'magento_orders_progress' end;
  end if;

  if v_order_done and v_magento_done then
    v_phase := 'completed';
  end if;

  v_state := jsonb_build_object(
    'started_at', coalesce(v_state->>'started_at', to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'updated_at', to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'completed_at', case when v_order_done and v_magento_done then to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') else null end,
    'batch_size', v_batch_size,
    'phase', v_phase,
    'last_error', null,
    'order_offset', v_processed_order_entries,
    'magento_offset', v_processed_magento_entries,
    'order_cursor_key', v_order_cursor,
    'magento_cursor_key', v_magento_cursor,
    'order_done', v_order_done,
    'magento_done', v_magento_done,
    'processed_order_entries', v_processed_order_entries,
    'processed_magento_entries', v_processed_magento_entries,
    'upserted_store_orders', v_upserted_store_orders,
    'upserted_magento_orders', v_upserted_magento_orders
  );

  insert into public.order_read_model_meta_1d6e33e0(key, value, updated_at)
  values ('meta:orders_read_model_rebuild_state', v_state, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

  return jsonb_build_object('state', v_state);
exception
  when others then
    v_state := jsonb_build_object(
      'started_at', coalesce(v_state->>'started_at', to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'completed_at', null,
      'batch_size', v_batch_size,
      'phase', 'error',
      'last_error', sqlerrm,
      'order_offset', coalesce(v_processed_order_entries, 0),
      'magento_offset', coalesce(v_processed_magento_entries, 0),
      'order_cursor_key', v_order_cursor,
      'magento_cursor_key', v_magento_cursor,
      'order_done', coalesce(v_order_done, false),
      'magento_done', coalesce(v_magento_done, false),
      'processed_order_entries', coalesce(v_processed_order_entries, 0),
      'processed_magento_entries', coalesce(v_processed_magento_entries, 0),
      'upserted_store_orders', coalesce(v_upserted_store_orders, 0),
      'upserted_magento_orders', coalesce(v_upserted_magento_orders, 0)
    );

    insert into public.order_read_model_meta_1d6e33e0(key, value, updated_at)
    values ('meta:orders_read_model_rebuild_state', v_state, now())
    on conflict (key) do update
      set value = excluded.value,
          updated_at = excluded.updated_at;

    return jsonb_build_object('state', v_state);
end;
$$;

create or replace function public.order_read_model_health_1d6e33e0()
returns jsonb
language sql
stable
as $$
with enabled_row as (
  select value
  from public.order_read_model_meta_1d6e33e0
  where key = 'meta:orders_read_model_enabled'
),
state_row as (
  select value
  from public.order_read_model_meta_1d6e33e0
  where key = 'meta:orders_read_model_rebuild_state'
),
store_summary as (
  select source_id, sort_key
  from public.order_summaries_1d6e33e0
  where record_kind = 'store_order'
),
magento_summary as (
  select source_id, sort_key
  from public.order_summaries_1d6e33e0
  where record_kind = 'magento_stored_order'
),
state_values as (
  select
    coalesce((value->>'order_done')::boolean, false) as order_done,
    coalesce((value->>'magento_done')::boolean, false) as magento_done,
    coalesce((value->>'upserted_store_orders')::integer, 0) as upserted_store_orders,
    coalesce((value->>'upserted_magento_orders')::integer, 0) as upserted_magento_orders,
    coalesce(value->>'last_error', '') as last_error
  from state_row
)
select jsonb_build_object(
  'enabled', coalesce((select (value->>'enabled')::boolean from enabled_row), false),
  'state', (select value from state_row),
  'store_orders', jsonb_build_object(
    'source_total', coalesce((select upserted_store_orders from state_values), 0),
    'summary_total', (select count(*) from store_summary),
    'latest_summary_ids', coalesce((select jsonb_agg(source_id) from (select source_id from store_summary order by sort_key desc, source_id desc limit 20) t), '[]'::jsonb),
    'missing_from_summary', case
      when coalesce((select order_done from state_values), false) and coalesce((select upserted_store_orders from state_values), 0) = (select count(*) from store_summary)
        then '[]'::jsonb
      when coalesce((select order_done from state_values), false)
        then jsonb_build_array('store_backfill_divergence')
      else jsonb_build_array('store_backfill_in_progress')
    end
  ),
  'magento_stored_orders', jsonb_build_object(
    'source_total', coalesce((select upserted_magento_orders from state_values), 0),
    'summary_total', (select count(*) from magento_summary),
    'latest_summary_ids', coalesce((select jsonb_agg(source_id) from (select source_id from magento_summary order by sort_key desc, source_id desc limit 20) t), '[]'::jsonb),
    'missing_from_summary', case
      when coalesce((select magento_done from state_values), false) and coalesce((select upserted_magento_orders from state_values), 0) = (select count(*) from magento_summary)
        then '[]'::jsonb
      when coalesce((select magento_done from state_values), false)
        then jsonb_build_array('magento_backfill_divergence')
      else jsonb_build_array('magento_backfill_in_progress')
    end
  )
);
$$;
