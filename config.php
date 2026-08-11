<?php
// Render-safe configuration. Set these values as Environment Variables in Render.
// Never hard-code production credentials in this file.
return [
  'db' => [
    'host' => getenv('BON_DB_HOST') ?: '127.0.0.1',
    'name' => getenv('BON_DB_NAME') ?: 'bon',
    'user' => getenv('BON_DB_USER') ?: 'bon',
    'pass' => getenv('BON_DB_PASS') ?: '',
    'port' => getenv('BON_DB_PORT') ?: '3306',
  ],
  'api_secret' => getenv('BON_API_SECRET') ?: '',
  'admin_email' => getenv('BON_ADMIN_EMAIL') ?: '',
  'admin_password' => getenv('BON_ADMIN_PASSWORD') ?: '',
  'prices' => [
    24 => 2000,
    720 => 50000,
    2160 => 120000
  ],
  'banks' => [
    'Sacombank' => ['account' => getenv('BON_BANK_SACOMBANK_ACCOUNT') ?: '', 'name' => getenv('BON_BANK_SACOMBANK_NAME') ?: ''],
    'VietinBank' => ['account' => getenv('BON_BANK_VIETINBANK_ACCOUNT') ?: '', 'name' => getenv('BON_BANK_VIETINBANK_NAME') ?: '']
  ],
  'withdraw_min' => 10000,
];
