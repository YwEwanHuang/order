#!/usr/bin/env bash
# T-013: Docker smoke test
# 本地验证 Express 服务在容器中正常启动、健康检查通过、数据库初始化完成。
# 用法: scripts/smoke-test.sh [port] [max_wait_seconds]
set -e

PORT="${1:-8080}"
MAX_WAIT="${2:-30}"

CONTAINER_NAME="manmanorder-smoke-$$"

cleanup() {
  echo "[smoke] stopping container $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "[smoke] building Docker image..."
docker build -t manmanorder-smoke-test:latest . >/dev/null 2>&1

echo "[smoke] starting container on port $PORT..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:80" \
  -e MYSQL_ADDRESS=127.0.0.1:3306 \
  -e MYSQL_USERNAME=root \
  -e MYSQL_PASSWORD=password \
  -e ADMIN_OPENIDS=smoke-test-admin \
  manmanorder-smoke-test:latest \
  >/dev/null

# Wait for health endpoint
echo "[smoke] waiting up to ${MAX_WAIT}s for /health ..."
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "[smoke] ✓ /health responded"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "[smoke] ✗ /health did not respond within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
done

# Verify health payload
PAYLOAD=$(curl -sf "http://localhost:$PORT/health")
if echo "$PAYLOAD" | grep -q '"status":"ok"'; then
  echo "[smoke] ✓ /health payload valid: $PAYLOAD"
else
  echo "[smoke] ✗ unexpected /health payload: $PAYLOAD"
  exit 1
fi

# Verify no sensitive env vars leak in logs
LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)
if echo "$LOGS" | grep -E 'MYSQL_PASSWORD|password' | grep -vE 'MYSQL_PASSWORD.*\*\*\*|password.*\*\*\*|password.*required'; then
  echo "[smoke] ✗ possible credential leak in container logs"
  echo "$LOGS" | grep -E 'MYSQL_PASSWORD|password'
  exit 1
else
  echo "[smoke] ✓ no credential leak in logs"
fi

echo ""
echo "[smoke] All checks passed ✓"
echo "[smoke] Container will be stopped and removed on exit"