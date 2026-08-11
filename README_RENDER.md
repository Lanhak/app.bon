# BON Server - Render Docker (MySQL/MariaDB)

This package keeps the existing BON PHP + MySQL API contract and removes the hard-coded
InfinityFree database credentials. It is intended for a Render Docker Web Service.

## Important

Render can run PHP through Docker, but this package deliberately keeps MySQL/MariaDB
instead of converting the whole application to PostgreSQL. Therefore the database must
be hosted separately on a MySQL/MariaDB service that allows remote connections.

Do NOT put database credentials in GitHub or PHP source.

## Deploy

1. Put this folder in a GitHub repository.
2. Render -> New -> Web Service -> select the repository.
3. Runtime/Language: Docker.
4. Instance: Free for testing.
5. No build command is required.
6. Deploy.

Render will provide an HTTPS URL such as:
https://bon-server-xxxx.onrender.com

## Required Render Environment Variables

BON_DB_HOST
BON_DB_PORT (usually 3306)
BON_DB_NAME
BON_DB_USER
BON_DB_PASS
BON_API_SECRET
BON_ADMIN_EMAIL
BON_ADMIN_PASSWORD

Optional bank variables:
BON_BANK_SACOMBANK_ACCOUNT
BON_BANK_SACOMBANK_NAME
BON_BANK_VIETINBANK_ACCOUNT
BON_BANK_VIETINBANK_NAME

## Database

Import db.sql into the external MySQL/MariaDB database.

Before using the app, test:

/test_db.php
/checkkey/api/check_date_key.php?APIKey=YOUR_KEY

The key endpoint should return application JSON directly. It should NOT return an
HTML JavaScript challenge.

## APK

Do not change the APK until the Render endpoint is confirmed working. Once confirmed,
change only the BON base URL/endpoints to the new onrender.com URL if the APK uses the
same paths.

## Free-plan limitation

Render documents that Free web services are suitable for testing/hobby use, while a
Free Render Postgres database expires after 30 days. This package therefore does not
pretend that Render provides a permanent free MySQL database.
