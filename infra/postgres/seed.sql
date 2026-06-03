-- ============================================================
-- SEED.SQL
-- Test data for local development only.
-- DO NOT run this on production.
--
-- Usage:
--   psql -U postgres -d movement_stream -f seed.sql
-- ============================================================

-- ─────────────────────────────────────────
-- SEED USERS
-- Password for ALL test users is: Test1234!
-- Hash generated with bcrypt rounds=10
-- ─────────────────────────────────────────
INSERT INTO users (email, password_hash, display_name, role) VALUES
  (
    'superadmin@movement.ng',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Test1234!
    'Super Admin',
    'super_admin'
  ),
  (
    'admin@movement.ng',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'Admin User',
    'admin'
  ),
  (
    'cam1@movement.ng',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'Camera Op 1',
    'camera_op'
  ),
  (
    'cam2@movement.ng',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'Camera Op 2',
    'camera_op'
  ),
  (
    'viewer@movement.ng',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'Test Viewer',
    'viewer'
  )
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────
-- SEED EVENTS
-- ─────────────────────────────────────────
INSERT INTO events (title, description, location, starts_at, ends_at, status, is_featured, created_by)
SELECT
  'Abuja Annual Peace Conference',
  'A gathering of religious and community leaders from across Nigeria to discuss pathways to unity and peaceful coexistence.',
  'Abuja',
  now() + interval '7 days',
  now() + interval '7 days' + interval '4 hours',
  'upcoming',
  true,
  id
FROM users WHERE email = 'superadmin@movement.ng'
ON CONFLICT DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at, status, is_featured, created_by)
SELECT
  'Kano Youth Vocational Summit',
  'Practical skills training and empowerment sessions for young people in Kano State.',
  'Kano',
  now() + interval '14 days',
  now() + interval '14 days' + interval '6 hours',
  'upcoming',
  false,
  id
FROM users WHERE email = 'superadmin@movement.ng'
ON CONFLICT DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at, status, is_featured, created_by)
SELECT
  'Kaduna Interfaith Rally',
  'A peaceful rally bringing Christians and Muslims together in Kaduna to demonstrate unity.',
  'Kaduna',
  now() + interval '21 days',
  now() + interval '21 days' + interval '3 hours',
  'upcoming',
  true,
  id
FROM users WHERE email = 'superadmin@movement.ng'
ON CONFLICT DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at, status, is_featured, created_by)
SELECT
  'Lagos Community Seminar',
  'Educational seminar on peaceful coexistence for Lagos communities.',
  'Lagos',
  now() - interval '7 days',
  now() - interval '7 days' + interval '3 hours',
  'ended',
  false,
  id
FROM users WHERE email = 'superadmin@movement.ng'
ON CONFLICT DO NOTHING;

\echo '✅ Seed data inserted successfully.'
\echo ''
\echo 'Test accounts (password: Test1234!):'
\echo '  superadmin@movement.ng  → super_admin'
\echo '  admin@movement.ng       → admin'
\echo '  cam1@movement.ng        → camera_op'
\echo '  cam2@movement.ng        → camera_op'
\echo '  viewer@movement.ng      → viewer'
