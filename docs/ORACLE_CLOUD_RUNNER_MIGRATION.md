# Kaveri Grading Runner — Oracle Cloud Migration Guide

**Goal:** Move the `go-judge` code execution runner from your laptop (ephemeral tunnel) to a permanent Always Free Oracle Cloud VM so students can get graded 24/7 even when your laptop is off.

**Estimated cost:** $0/month (Oracle Always Free tier: 2 OCPU ARM, 12 GB RAM, 200 GB storage).

**Estimated time:** 45 minutes for setup + 15 minutes for DNS propagation.

---

## PHASE 1: Oracle Cloud Account (Browser, 10 min)

1. Go to **https://cloud.oracle.com/free** and click **Start for Free**.
2. Sign up with a new email (or your existing one). Use your business email for the billing contact.
3. **Phone verification** — Oracle sends an SMS with a code.
4. **Credit/debit card verification** — Oracle pre-authorizes ~$1 and refunds it immediately. This is required even for Always Free; you will never be charged as long as you stay within free-tier limits.
5. Choose your **Home Region** — pick `ap-hyderabad-1` (Hyderabad) or `ap-mumbai-1` (Mumbai) for lowest latency to India. Once chosen, it cannot be changed.
6. Complete the signup and confirm your email.

---

## PHASE 2: Create the ARM VM (Browser + Terminal, 15 min)

### 2a. Generate an SSH key (on your laptop)

```bash
# In Git Bash or WSL
ssh-keygen -t ed25519 -C "kaveri-judge" -f ~/.ssh/kaveri-judge-key -N ""
cat ~/.ssh/kaveri-judge-key.pub
# Copy the output (starts with ssh-ed25519 ...)
```

### 2b. Create the compute instance

1. Log in to **Oracle Cloud Console** (https://cloud.oracle.com).
2. Click the hamburger menu → **Compute** → **Instances** → **Create Instance**.
3. Fill in:
   - **Name:** `kaveri-judge-runner`
   - **Image:** Select **Ubuntu 24.04** (or latest LTS available).
   - **Shape:** **Ampere A1 Flex** — set **2 OCPUs** and **12 GB RAM** (within Always Free limits).
   - **SSH Keys:** Paste the public key from step 2a (or upload the `.pub` file).
   - **VNIC (network):** Default VCN/subnet. **Check** "Assign public IP address" (required — you need a public IP).
   - **Boot Volume:** Leave defaults (47 GB is within free tier).
4. Click **Create** and wait for the instance to reach **Running** state (usually 2–3 minutes).
5. Copy the **Public IP address** shown on the instance detail page (e.g. `152.70.x.x`).

### 2c. Test SSH access

```bash
# From your laptop (Git Bash)
ssh -i ~/.ssh/kaveri-judge-key ubuntu@<PUBLIC_IP>
# You should see the Ubuntu welcome message.
```

---

## PHASE 3: Bootstrap the Runner (on the VM, 5 min)

Copy-paste this **entire block** into your SSH session on the VM. It installs Docker, copies the runner image, and starts go-judge:

```bash
# --- Kaveri runner bootstrap ---
set -euo pipefail

# 1. Install Docker
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin

# 2. Generate a new runner token (64 hex chars)
RUNNER_TOKEN=$(openssl rand -hex 32)
echo "RUNNER_TOKEN=$RUNNER_TOKEN" | sudo tee /etc/kaveri-runner.env > /dev/null
sudo chmod 600 /etc/kaveri-runner.env

# 3. Run go-judge (matches your current setup: privileged, cgroupns=host, 4 parallel)
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

# 4. Verify it works
sleep 3
source /etc/kaveri-runner.env
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $RUNNER_TOKEN" \
  http://127.0.0.1:5050/version

echo "=== DONE ==="
echo "Runner token: see /etc/kaveri-runner.env"
echo "Local test: curl -H 'Authorization: Bearer \$RUNNER_TOKEN' http://127.0.0.1:5050/version"
```

**Save the output line `RUNNER_TOKEN=...`** — you'll need it for Step 5.

---

## PHASE 4: Expose via HTTPS (on the VM, 5 min)

go-judge speaks plain HTTP. Supabase Edge Functions require HTTPS. We use **Caddy** (automatic HTTPS reverse proxy) to expose port 5050 publicly:

```bash
# --- Install Caddy + reverse proxy ---
set -euo pipefail

# Install Caddy
sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq caddy

# Write Caddyfile — will be updated with your domain in Phase 5
sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDY'
judge.kaveritech.co.in {
    reverse_proxy 127.0.0.1:5050

    # Only allow Bearer auth (this is a bonus — go-judge already validates)
    header Authorization {http.request.header.Authorization}

    # Timeout for long-running code executions (30s)
    reverse_proxy 127.0.0.1:5050 {
        transport http {
            read_timeout 30s
        }
    }
}
CADDY

# Start Caddy
sudo systemctl restart caddy
sudo systemctl enable caddy

# Verify (Caddy returns 401 without token — expected)
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5050/version
echo "=== Caddy ready ==="
echo "Public URL will be: https://judge.kaveritech.co.in"
```

> **Note:** Caddy will automatically obtain a Let's Encrypt TLS certificate for `judge.kaveritech.co.in` once DNS is configured in Phase 5. Until then, it will retry certificate issuance every few minutes.

---

## PHASE 5: DNS Configuration (Browser, 5 min)

You need to add a DNS A record pointing `judge.kaveritech.co.in` to your Oracle VM's public IP.

1. Log in to your DNS provider (where `kaveritech.co.in` is managed — likely **Cloudflare** or your domain registrar's DNS panel).
2. Add a new **A record**:
   - **Host/Name:** `judge`
   - **Type:** A
   - **Value/Target:** `<YOUR_ORACLE_VM_PUBLIC_IP>` (e.g. `152.70.x.x`)
   - **TTL:** Auto or 300 seconds (5 min)
3. Save and wait 2–10 minutes for propagation.

**Verify DNS propagated:**
```bash
# From your laptop
nslookup judge.kaveritech.co.in
# Should show your Oracle VM's public IP
```

Once DNS propagates, Caddy auto-provisions HTTPS:
```bash
# From your laptop — should return 401 (auth required)
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://judge.kaveritech.co.in/version
```

---

## PHASE 6: Update Supabase Secrets (Terminal, 2 min)

Tell the edge function to use the new permanent runner URL:

```bash
# Generate a NEW token (never reuse the old laptop token)
# OR use the one from Step 3: cat /etc/kaveri-runner.env on the VM

# Update Supabase secrets
cd "C:/Users/ASUS ExpertBook/kaverilmspracticeplayground"
npx supabase secrets set "GO_JUDGE_URL=https://judge.kaveritech.co.in/"
npx supabase secrets set "GO_JUDGE_TOKEN=<RUNNER_TOKEN_FROM_STEP_3>"
# Example (replace the token with yours):
# npx supabase secrets set "GO_JUDGE_TOKEN=abc123def456..."
```

No redeployment needed — secrets are read at runtime by the edge function.

---

## PHASE 7: Verify (Terminal, 2 min)

```bash
# 1. Direct runner test (from laptop)
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer <RUNNER_TOKEN>" \
  https://judge.kaveritech.co.in/version
# Expected: 200

# 2. Full code execution test
curl -s --max-time 30 \
  -H "Authorization: Bearer <RUNNER_TOKEN>" \
  -H "Content-Type: application/json" \
  https://judge.kaveritech.co.in/run \
  -d '{"cmd":[{"args":["/usr/bin/python3","-I","s.py"],"env":["PATH=/usr/bin:/bin"],"files":[{"content":""},{"name":"stdout","max":65536},{"name":"stderr","max":65536}],"cpuLimit":2000000000,"clockLimit":5000000000,"memoryLimit":134217728,"procLimit":30,"copyIn":{"s.py":{"content":"print(6*7)"}},"copyOut":["stdout","stderr"]}]}'
# Expected: status=Accepted, stdout="42"

# 3. Edge function probe (if you kept runner-probe temporarily deployed)
# Expected: versionStatus 200, runStatus 200, stdout "edge-to-runner-ok"
```

---

## PHASE 8: Cleanup Your Laptop (Optional)

Once the Oracle VM is confirmed working:

```bash
# On your laptop — stop the local runner and watchdog
docker stop kaveri-go-judge
docker rm kaveri-go-judge
# Remove the watchdog from Startup folder
rm "$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/kaveri-runner-watchdog.vbs"
# Remove old tunnel processes
taskkill //IM cloudflared.exe //F 2>/dev/null || true
# Clean up local secrets (optional — keep as backup)
# rm -rf ~/.kaveri-secure/
```

The local runner is no longer needed once the Oracle VM is live and verified.

---

## QUICK REFERENCE: Important Values

| Item | Where to find |
|---|---|
| Oracle VM public IP | Oracle Cloud Console → Compute → Instances → kaveri-judge-runner |
| Runner token | SSH into VM → `cat /etc/kaveri-runner.env` |
| Supabase GO_JUDGE_URL | `https://judge.kaveritech.co.in/` |
| Supabase GO_JUDGE_TOKEN | Same as the runner token (set in Phase 6) |
| Caddy logs (debug) | SSH → `sudo journalctl -u caddy -f` |
| Docker logs (debug) | SSH → `sudo docker logs -f kaveri-go-judge` |

---

## TROUBLESHOOTING

**"SSL certificate not provisioning"**
- Ensure DNS points to the correct IP (`dig judge.kaveritech.co.in`).
- Wait up to 10 minutes for Let's Encrypt validation.
- Check Caddy logs: `sudo journalctl -u caddy --no-pager -n 50`.

**"403 Forbidden from Caddy"**
- Caddy's default config may block non-standard paths. Ensure the Caddyfile has `reverse_proxy 127.0.0.1:5050` inside the site block.

**"Runner crashes on startup"**
- Ensure `--privileged --cgroupns=host` flags are present (required for go-judge sandboxing).
- Check Docker logs: `sudo docker logs kaveri-go-judge`.

**"Supabase edge function returns RUNNER_NOT_CONFIGURED"**
- Verify secrets were set: `npx supabase secrets list | grep GO_JUDGE`.
- Verify the URL has a trailing slash: `https://judge.kaveritech.co.in/`.

**"Oracle reclaims my Always Free VM"**
- Never happens if the VM has running processes (go-judge is always listening). Idle-VM reclamation only affects completely stopped instances.

---

## WHAT HAPPENS AFTER

- **Students** submit code via the VS Code extension → `secure-grade` edge function → Oracle VM → go-judge → verified score written back → student sees result.
- **Faculty** sees verified scores in the LMS faculty portal.
- **Your laptop** can be off — grading continues 24/7 on the Oracle VM.
- **Cost** remains $0/month as long as you stay within Always Free limits (2 OCPU / 12 GB RAM / 200 GB storage — your grading workload is well under this).
