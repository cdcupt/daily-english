// Test-only OAuth client ids — set before src/env.ts evaluates so verifyGoogle /
// verifyApple have a configured audience to accept against. Fixed strings the
// oauth.test.ts mints its `aud` claim against. Never used outside tests.
process.env['GOOGLE_CLIENT_ID'] = 'test-google-client.apps.googleusercontent.com';
process.env['APPLE_CLIENT_ID'] = 'com.cdcupt.dailyenglish.web';
