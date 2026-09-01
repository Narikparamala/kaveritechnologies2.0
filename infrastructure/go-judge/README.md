# Kaveri isolated Python runner

This directory builds the free, self-hosted go-judge v1.12.3 runner used by
the secure-grade Supabase Edge Function.

## Security boundary

- Student browsers must never call this service directly.
- The API requires GO_JUDGE_TOKEN.
- The local port is bound only to 127.0.0.1.
- Submitted programs run without network access.
- CPU, wall-time, memory, process and output limits are applied per execution.
- The privileged container must run only on a dedicated, patched Linux host in production.
- Production access requires TLS, firewall/IP restrictions and server-to-server authentication.

## Local start

Set GO_JUDGE_TOKEN in the shell, then run:

    docker compose up -d --build

Do not place the token in Git, frontend variables, screenshots or logs.

## Edge Function environment

    GO_JUDGE_URL=https://private-runner.example.com
    GO_JUDGE_TOKEN=<same private runner token>

The local Docker Desktop runner is for development verification. A deployed
Supabase Edge Function cannot reach a laptop address such as 127.0.0.1.