#!/usr/bin/env bash
# Repeatable check that the API still behaves the same after a refactor.
# Usage: start the backend (npm run dev), then run:  bash smoke-test.sh
# It creates a throw-away user and deletes it again at the end.

API="${API:-http://localhost:5000/api}"
TS=$(date +%s)
USERNAME="smoke$TS"
EMAIL="smoke$TS@example.com"
PASS="secret123"
NEWPASS="newsecret456"
JAR=$(mktemp)
FRESH=$(mktemp)
PASSED=0
FAILED=0

# check "name" expected_status  curl-args...
check() {
  local name="$1" expected="$2"; shift 2
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  if [ "$actual" = "$expected" ]; then
    echo "PASS  $name ($actual)"; PASSED=$((PASSED+1))
  else
    echo "FAIL  $name (expected $expected, got $actual)"; FAILED=$((FAILED+1))
  fi
}
J='-H Content-Type:application/json'

check "health"                         200 "$API/health"
check "register"                       201 -X POST $J -d "{\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"password\":\"$PASS\"}" "$API/register"
check "register duplicate"             409 -X POST $J -d "{\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"password\":\"$PASS\"}" "$API/register"
check "register bad body"              400 -X POST $J -d '{"email":"nope","username":"","password":"1"}' "$API/register"
check "login wrong password"           401 -X POST $J -d "{\"identifier\":\"$USERNAME\",\"password\":\"wrong-pass\"}" "$API/login"
check "login ok (saves cookies)"       200 -c "$JAR" -X POST $J -d "{\"identifier\":\"$USERNAME\",\"password\":\"$PASS\"}" "$API/login"
check "me with cookies"                200 -b "$JAR" "$API/me"
check "role with cookies"              200 -b "$JAR" "$API/role"
check "me without cookies"             401 "$API/me"
check "admin route as normal user"     403 -b "$JAR" "$API/admin/users"
check "profile update (age)"           200 -b "$JAR" -X PATCH $J -d '{"age":30}' "$API/profile"
check "profile update (empty body)"    400 -b "$JAR" -X PATCH $J -d '{}' "$API/profile"
check "refresh with cookie"            200 -b "$JAR" -c "$JAR" -X POST "$API/auth/refresh"
check "refresh without cookie"         401 -X POST "$API/auth/refresh"
check "change password"                200 -b "$JAR" -c "$JAR" -X PATCH $J -d "{\"currentPassword\":\"$PASS\",\"newPassword\":\"$NEWPASS\"}" "$API/profile/password"
check "login with new password"        200 -c "$JAR" -X POST $J -d "{\"identifier\":\"$USERNAME\",\"password\":\"$NEWPASS\"}" "$API/login"
check "logout"                         200 -b "$JAR" -c "$JAR" -X POST "$API/auth/logout"
check "login again before delete"      200 -c "$JAR" -X POST $J -d "{\"identifier\":\"$USERNAME\",\"password\":\"$NEWPASS\"}" "$API/login"
check "delete account"                 200 -b "$JAR" -c "$JAR" -X DELETE $J -d "{\"password\":\"$NEWPASS\"}" "$API/profile"
check "login after delete"             401 -c "$FRESH" -X POST $J -d "{\"identifier\":\"$USERNAME\",\"password\":\"$NEWPASS\"}" "$API/login"

rm -f "$JAR" "$FRESH"
echo
echo "Passed: $PASSED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]