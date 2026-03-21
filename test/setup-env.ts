process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL ??=
  'postgresql://test:test@127.0.0.1:5432/llmpath_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-minimum-32-characters!!';
process.env.JWT_ACCESS_EXPIRES ??= '15m';
process.env.JWT_REFRESH_EXPIRES_DAYS ??= '7';
