ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata';

ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text';

ALTER TABLE conversations ADD COLUMN phone_number_id TEXT;
ALTER TABLE conversations ADD COLUMN customer_last_message_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
