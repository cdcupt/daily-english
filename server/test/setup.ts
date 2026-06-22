// Test-only OAuth client ids — set before src/env.ts evaluates so verifyGoogle /
// verifyApple have a configured audience to accept against. Fixed strings the
// oauth.test.ts mints its `aud` claim against. Never used outside tests.
// APPLE_IOS_CLIENT_ID has no default in env.ts (it must not auto-enable Apple),
// so we set it explicitly here to exercise the native (iOS) audience path.
process.env['GOOGLE_CLIENT_ID'] = 'test-google-client.apps.googleusercontent.com';
process.env['APPLE_CLIENT_ID'] = 'com.cdcupt.dailyenglish.web';
process.env['APPLE_IOS_CLIENT_ID'] = 'com.cdcupt.DailyEnglish';

// A dummy OpenAI key so the moderation module (Topic Sessions safety gate) has a
// configured key under test; the moderations endpoint is always mocked (no net).
process.env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? 'test-openai-key';
