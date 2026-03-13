# Phase 48 — Collector Service Mode: Design

**Date:** 2026-03-12
**Author:** Claude (claude-sonnet-4-6)
**Status:** Approved

## Context

The `OPERATIONAL_COLLECTOR_INTERFACE` (established in Phase 43) declares:

```js
integrationModes: ['file', 'api', 'service']
```

Phases 44 and 47 implemented `file`, `synthetic`, and `api` modes. Phase 48 closes the contract
by implementing `service` mode.

## Problem

The `api` mode fetches fresh data on every call. If the producer runs frequently (or multiple
callers invoke `collectOperationalSources` in quick succession), each invocation makes a separate
HTTP request to the internal observability API. This is wasteful and adds latency.

## Solution: Lazy polling with in-memory cache

The `service` mode introduces a **module-level singleton cache**. When called:

1. If cached data exists and is younger than the TTL → return cached data immediately (no network)
2. If cache is empty or stale → call `buildApiSources()` (same fetch as `api` mode), store result, return it

This is "lazy polling" — no background timer, no persistent process. The refresh happens
on-demand, only when data is stale. Safe for CI (no dangling timers blocking process exit).

## Architecture

```
collectOperationalSources({ mode: 'service', ... })
        │
        ▼
  _serviceCache.fetchedAt exists AND age < ttlMs?
   ├── YES → return _serviceCache.sources  [cache hit, no network]
   └── NO  → buildApiSources({ apiBaseUrl, apiKey })
               → store in _serviceCache
               → return fresh sources       [cache miss, network call]
```

## Components

### `_serviceCache` (module-level singleton)
```js
const _serviceCache = { sources: null, fetchedAt: null };
```
Lives for the duration of the Node.js process. Each test run starts with an empty cache.

### `buildServiceSources({ apiBaseUrl, apiKey, ttlMs })`
New private function in `phase44-operational-collector.mjs`. Returns the collector sources
from cache or fresh fetch. Does NOT add extra metadata fields — returns plain sources identical
in shape to what `buildApiSources()` returns, so `validateCollectorSources()` works unchanged.

### `collectOperationalSources()` update
- New option: `options.serviceTtlMs`
- New env var: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_SERVICE_TTL_MS` (default: `300000` = 300s)
- New branch: `if (mode === 'service')` before `if (mode === 'api')`
- `collectorMode` returns `'service'`

## Configuration

| Env var | Default | Description |
|---|---|---|
| `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_SERVICE_TTL_MS` | `300000` | Cache TTL in ms (5 min) |
| `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL` | `http://localhost:3000` | Shared with api mode |
| `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY` | (empty) | Shared with api mode |

## Error handling

- If `buildApiSources()` throws (network error, timeout, non-200), the error propagates.
- The cache is **not updated** on error — stale cache is preferred to no data.
- Error messages follow the same `"collector api ..."` prefix convention from Phase 47.

## Testing strategy

File: `scripts/phase48-collector-service-mode-drill.mjs`

Uses the same `withMockServer()` helper pattern from Phase 47.

| Drill | Assertion |
|---|---|
| `service_cache_hit` | Call twice with same mock server; verify server received exactly 1 request |
| `service_cache_miss` | Call twice with `ttlMs=0`; verify server received 2 requests |
| `service_stale_refresh` | Call with `ttlMs=1`, wait 5ms, call again; verify 2 requests (stale → refresh) |
| `service_env_selection` | Set `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=service` env; call with `{}`; verify `collectorMode=service` |

TDD cycle: write drill first (red), implement, verify green, check no regression on phase44/46/47 drills.

## Files changed

| File | Change |
|---|---|
| `scripts/phase44-operational-collector.mjs` | Add `_serviceCache`, `buildServiceSources()`, `service` branch in `collectOperationalSources()` |
| `scripts/phase48-collector-service-mode-drill.mjs` | New — 4 drills |
| `package.json` | Add `test:phase48` |
| `config/standalone-export.json` | Add `npm run test:phase48` to `validateCommands` |

## Definition of done

- [ ] 4 drills pass locally
- [ ] `npm run test:phase44`, `test:phase47` still pass (no regression)
- [ ] CI run in `institutobeatriz/supervisor-comercial-v2.0` green
- [ ] `docs/analise-projeto/59-fase-48-validacao.md` created
- [ ] Memory, HANDOFF, TODO_AI updated
- [ ] WIP commit `handoff(phase48): collector service mode`
