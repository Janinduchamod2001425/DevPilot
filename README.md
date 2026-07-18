# DevPilot

DevPilot is a self-hosted deployment platform for building and running applications from Git repositories.

## Applications

- `apps/dashboard`: Nuxt dashboard
- `apps/api`: NestJS HTTP API
- `apps/worker`: NestJS deployment worker

## Local prerequisites

- Node.js 22+
- pnpm 11+
- Docker Desktop with WSL2 on Windows

## Getting started

1. Copy `.env.example` to `.env`.
2. Run `pnpm install`.
3. Run `pnpm infra:up`.
4. Run `pnpm dev`.

The dashboard runs on `http://localhost:3000` and the API health endpoint is `http://localhost:4000/api/health`.
