#!/usr/bin/env bash
# Kaveri go-judge runner — Oracle Cloud VM bootstrap
# Run this on a fresh Ubuntu VM via: ssh -i ~/.ssh/kaveri-judge-key ubuntu@<IP> 'bash -s' < oracle-runner-setup.sh
set -euo pipefail

RUNNER_TOKEN=$(openssl rand -hex 32)
echo "Generated runner token (saved to /etc/kaveri-runner.env)"
echo "RUNNER_TOKEN=$RUNNER_TOKEN" | sudo tee /etc/kaveri-runner.env > /dev/null
sudo chmod 600 /etc/kaveri-runner.env

echo "=== Installing Docker ==="
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io

echo "=== Starting go-judge ==="
sudo docker run -d \
  --name kaveri-go-judge \
  --restart unless-stopped \
  --privileged \
  --cgroupns=host \
  --memory 10g \
  --security-opt label=disable \
  -p 127.0.0.1:5050:5050 \
  kaveri/go-judge-python:1.12.3 \
  -http-addr 0.0.0.0:5050 \
  -auth-token "$RUNNER_TOKEN" \
  -parallelism 4 \
  -output-limit 1048576 \
  -copy-out-limit 1048576

sleep 3
curl -s -o /dev/null -w "go-judge HTTP %{http_code}\n" \
  -H "Authorization: Bearer $RUNNER_TOKEN" http://127.0.0.1:5050/version

echo "=== Installing Caddy ==="
sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDY'
judge.kaveritech.co.in {
    reverse_proxy 127.0.0.1:5050
    reverse_proxy 127.0.0.1:5050 {
        transport http {
            read_timeout 30s
        }
    }
}
CADDY

sudo systemctl restart caddy
sudo systemctl enable caddy

echo ""
echo "========================================="
echo "  RUNNER SETUP COMPLETE"
echo "========================================="
echo ""
echo "  Runner token:  $RUNNER_TOKEN"
echo "  Token file:    /etc/kaveri-runner.env"
echo "  Local test:    curl -H 'Authorization: Bearer TOKEN' http://127.0.0.1:5050/version"
echo ""
echo "  NEXT STEPS:"
echo "  1. Add DNS A record: judge.kaveritech.co.in -> $(curl -s ifconfig.me)"
echo "  2. Wait 2-10 min for propagation + Caddy cert"
echo "  3. Test: curl -s https://judge.kaveritech.co.in/version"
echo "  4. Update Supabase secrets:"
echo "     npx supabase secrets set GO_JUDGE_URL=https://judge.kaveritech.co.in/"
echo "     npx supabase secrets set GO_JUDGE_TOKEN=$RUNNER_TOKEN"
echo "========================================="
