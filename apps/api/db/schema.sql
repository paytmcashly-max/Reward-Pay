create table if not exists users (
  id text primary key,
  phone text not null unique,
  name text not null,
  referral_code text not null unique,
  referred_by_user_id text references users(id),
  role text not null,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  user_id text primary key references users(id),
  login_phone text not null unique,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists otp_sessions (
  phone text primary key,
  session_id text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists wallet_accounts (
  user_id text primary key references users(id),
  principal_balance numeric(12,2) not null default 0,
  reward_balance numeric(12,2) not null default 0,
  listed_balance numeric(12,2) not null default 0,
  sold_balance numeric(12,2) not null default 0,
  withdrawable_balance numeric(12,2) not null default 0,
  locked_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists wallet_transactions (
  id text primary key,
  user_id text not null references users(id),
  type text not null,
  amount numeric(12,2) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists deposit_orders (
  id text primary key,
  user_id text not null references users(id),
  amount numeric(12,2) not null,
  provider text not null,
  status text not null,
  checkout_url text not null,
  provider_order_id text,
  checkout_session jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deposit_provider_events (
  id text primary key,
  deposit_order_id text not null references deposit_orders(id),
  provider text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reward_rules (
  id text primary key,
  min_deposit_amount numeric(12,2) not null,
  max_deposit_amount numeric(12,2) not null,
  reward_percent numeric(5,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists reward_credits (
  id text primary key,
  user_id text not null references users(id),
  deposit_order_id text references deposit_orders(id),
  reward_rule_id text references reward_rules(id),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists chunk_buckets (
  id text primary key,
  label text not null,
  min_amount numeric(12,2) not null,
  max_amount numeric(12,2) not null,
  target_amount numeric(12,2) not null,
  active boolean not null default true
);

create table if not exists sell_orders (
  id text primary key,
  user_id text not null references users(id),
  deposit_order_id text not null references deposit_orders(id),
  total_amount numeric(12,2) not null,
  sold_amount numeric(12,2) not null default 0,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists sell_order_chunks (
  id text primary key,
  sell_order_id text not null references sell_orders(id),
  user_id text not null references users(id),
  bucket_id text not null references chunk_buckets(id),
  amount numeric(12,2) not null,
  remaining_amount numeric(12,2) not null,
  listed_at timestamptz not null default now()
);

create table if not exists demand_pools (
  id text primary key,
  bucket_id text not null references chunk_buckets(id),
  label text not null,
  requested_amount numeric(12,2) not null,
  remaining_amount numeric(12,2) not null,
  priority integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists trade_matches (
  id text primary key,
  sell_order_chunk_id text not null references sell_order_chunks(id),
  demand_pool_id text not null references demand_pools(id),
  user_id text not null references users(id),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists withdraw_beneficiaries (
  id text primary key,
  user_id text not null references users(id),
  type text not null,
  label text not null,
  account_name text not null,
  upi_id text,
  bank_account_number text,
  ifsc_code text,
  created_at timestamptz not null default now()
);

create table if not exists withdraw_requests (
  id text primary key,
  user_id text not null references users(id),
  beneficiary_id text not null references withdraw_beneficiaries(id),
  amount numeric(12,2) not null,
  status text not null,
  provider_reference text,
  provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists referrals (
  user_id text primary key references users(id),
  referral_code text not null unique,
  total_referred_users integer not null default 0,
  rewarded_referrals integer not null default 0,
  total_reward_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists referral_rewards (
  id text primary key,
  referrer_user_id text not null references users(id),
  referred_user_id text not null references users(id),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_logs (
  id text primary key,
  admin_user_id text not null references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
