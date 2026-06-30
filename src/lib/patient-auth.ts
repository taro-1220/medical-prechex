// Patient account foundation — Phase2+ implementation stubs
//
// Phase1: login is not required. patients.user_id is always null.
// Phase2+: populate user_id when patient authenticates.
//
// Planned auth methods:
//   TODO: LINE login (OAuth via Supabase provider)
//   TODO: email OTP (Supabase auth.signInWithOtp)
//
// Planned patient features:
//   TODO: appointment list (GET /api/patient/appointments)
//   TODO: consent history (GET /api/patient/consents)
//   TODO: QR re-display (GET /api/patient/appointments/:id/qr)
//   TODO: family member management (patients.parent_user_id)
//
// Linking flow (Phase2+):
//   1. Patient authenticates → get auth.users.id
//   2. PATCH /api/patient/link: UPDATE patients SET user_id = $1
//      WHERE (phone = $2 OR email = $3) AND clinic_id = $4
//   3. RLS: patients are readable by matching auth.uid() = user_id

export {};
