CREATE TABLE IF NOT EXISTS users (
 id BIGINT  PRIMARY KEY,
 username VARCHAR(50) NULL UNIQUE,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('user','admin') NOT NULL DEFAULT 'user',
 balance BIGINT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

CREATE TABLE IF NOT EXISTS vip_keys (
 id BIGINT  PRIMARY KEY,
 key_value VARCHAR(80) NOT NULL UNIQUE,
 duration_hours INT NOT NULL,
 price BIGINT NOT NULL DEFAULT 0,
 expires_at DATETIME NULL,
 device_limit INT NOT NULL DEFAULT 1,
 status ENUM('active','disabled','expired') NOT NULL DEFAULT 'active',
 user_id BIGINT NULL,
 note VARCHAR(255) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_key_user(user_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ;

CREATE TABLE IF NOT EXISTS key_devices (
 id BIGINT  PRIMARY KEY,
 key_id BIGINT NOT NULL,
 device_hash CHAR(64) NOT NULL,
 first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_key_device(key_id,device_hash),
 FOREIGN KEY(key_id) REFERENCES vip_keys(id) ON DELETE CASCADE
) ;

CREATE TABLE IF NOT EXISTS balance_transactions (
 id BIGINT  PRIMARY KEY,
 user_id BIGINT NOT NULL,
 amount BIGINT NOT NULL,
 balance_after BIGINT NOT NULL,
 type ENUM('admin_topup','purchase','admin_adjust') NOT NULL,
 description VARCHAR(255) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 KEY idx_tx_user(user_id)
) ;


CREATE TABLE IF NOT EXISTS wallet_requests (
 id BIGINT  PRIMARY KEY,
 user_id BIGINT NOT NULL,
 request_type ENUM('deposit','withdraw') NOT NULL,
 amount BIGINT NOT NULL,
 bank_name VARCHAR(100) NOT NULL,
 account_number VARCHAR(50) NULL,
 account_name VARCHAR(190) NULL,
 note VARCHAR(255) NULL,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 admin_note VARCHAR(255) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 processed_at DATETIME NULL,
 KEY idx_wallet_user(user_id),
 KEY idx_wallet_status(status),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ;

-- Kho nhiệm vụ Facebook cho auto tool GoLike (api_golike_fb.php)
CREATE TABLE IF NOT EXISTS fb_jobs (
 id BIGINT  PRIMARY KEY,
 link VARCHAR(255) NOT NULL,
 object_id VARCHAR(100) NOT NULL,
 type VARCHAR(20) NOT NULL DEFAULT 'like',
 reaction VARCHAR(20) NOT NULL DEFAULT 'like',
 price INT NOT NULL DEFAULT 35,
 max_uses INT NOT NULL DEFAULT 9999,
 used_count INT NOT NULL DEFAULT 0,
 status ENUM('active','disabled') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- Kho nhiệm vụ TikTok cho auto tool GoLike (api_golike_tiktok.php)
CREATE TABLE IF NOT EXISTS tiktok_jobs (
 id BIGINT  PRIMARY KEY,
 video_url VARCHAR(255) NOT NULL,
 ads_id VARCHAR(100) NOT NULL,
 account_id VARCHAR(100) NOT NULL,
 price INT NOT NULL DEFAULT 20,
 max_uses INT NOT NULL DEFAULT 9999,
 used_count INT NOT NULL DEFAULT 0,
 status ENUM('active','disabled') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- Lịch sử hoàn thành nhiệm vụ (chống làm lại cùng job trên cùng thiết bị)
CREATE TABLE IF NOT EXISTS job_completions (
 id BIGINT  PRIMARY KEY,
 platform VARCHAR(10) NOT NULL,
 job_id BIGINT NOT NULL,
 device_hash CHAR(64) NOT NULL,
 user_id BIGINT NULL,
 amount INT NOT NULL DEFAULT 0,
 status ENUM('done','reported') NOT NULL DEFAULT 'done',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_platform_job_device (platform, job_id, device_hash)
) ;

-- Báo cáo lỗi nhiệm vụ từ app
CREATE TABLE IF NOT EXISTS job_reports (
 id BIGINT  PRIMARY KEY,
 platform VARCHAR(10) NOT NULL,
 job_id BIGINT NOT NULL,
 uid VARCHAR(100) NULL,
 device_hash CHAR(64) NOT NULL,
 description VARCHAR(255) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- Lịch sử cộng xu từ app (addHistory -> /checkkey/) + giới hạn tốc độ
CREATE TABLE IF NOT EXISTS app_credits (
 id BIGINT  PRIMARY KEY,
 user_id BIGINT NOT NULL,
 device_hash CHAR(64) NOT NULL,
 name_tool VARCHAR(50) NOT NULL DEFAULT '',
 amount INT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_credits_device_time (device_hash, created_at),
 KEY idx_credits_user (user_id)
) ;
