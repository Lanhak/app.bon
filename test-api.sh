#!/bin/sh
BASE="${BASE:-http://127.0.0.1:3000}"
echo "== ROOT =="
curl -s "$BASE/"
echo
echo "== ANNOUNCEMENT =="
curl -s "$BASE/checkkey/api/announcement.json"
echo
echo "== STATISTICS =="
curl -s "$BASE/statistics" | head -c 200
echo
