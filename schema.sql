-- BON SERVER PostgreSQL schema.
-- The application also runs these migrations automatically at startup.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50),
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (LOWER(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS vip_keys (
  id BIGSERIAL PRIMARY KEY,
  key_value VARCHAR(80) NOT NULL UNIQUE,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  price BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  device_limit INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  user_id BIGINT,
  note VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS key_devices (
  id BIGSERIAL PRIMARY KEY,
  key_id BIGINT NOT NULL,
  device_hash CHAR(64) NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(key_id,device_hash)
);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  type VARCHAR(30) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  request_type VARCHAR(20) NOT NULL,
  amount BIGINT NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(80),
  account_name VARCHAR(190),
  note VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fb_jobs (
  id BIGSERIAL PRIMARY KEY,
  link VARCHAR(255) NOT NULL,
  object_id VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'like',
  reaction VARCHAR(20) NOT NULL DEFAULT 'like',
  price INTEGER NOT NULL DEFAULT 35,
  max_uses INTEGER NOT NULL DEFAULT 9999,
  used_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tiktok_jobs (
  id BIGSERIAL PRIMARY KEY,
  video_url VARCHAR(255) NOT NULL,
  ads_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL DEFAULT 20,
  max_uses INTEGER NOT NULL DEFAULT 9999,
  used_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_completions (
  id BIGSERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  job_id BIGINT NOT NULL,
  device_hash CHAR(64) NOT NULL,
  user_id BIGINT,
  amount INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform,job_id,device_hash)
);

CREATE TABLE IF NOT EXISTS job_reports (
  id BIGSERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  job_id BIGINT NOT NULL,
  uid VARCHAR(100),
  device_hash CHAR(64) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_credits (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  device_hash CHAR(64) NOT NULL,
  name_tool VARCHAR(50) NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
