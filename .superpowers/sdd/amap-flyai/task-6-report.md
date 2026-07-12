# Task 6 Report — Gateway Resilience and HTTP Authentication

## Status

Implemented the Task 6 brief on HEAD `e232cae` with test-first RED/GREEN evidence. Scope is limited to the gateway cache, limiter, service orchestration, Node HTTP server, and their tests.

## RED evidence

Command:

```text
cd services/travel-provider-gateway
npm run test
```

Observed before production implementation:

```text
Test Files  4 failed | 2 passed (6)
Tests       37 passed (37)
```

All four new suites failed because the intended runtime modules were absent:

- `Cannot find module '../src/cache.js'`
- `Cannot find module '../src/limiter.js'`
- `Cannot find module '../src/service.js'`
- `Cannot find module '../src/server.js'`

## GREEN evidence

Focused command:

```text
npm run test -- tests/cache.test.ts tests/limiter.test.ts tests/service.test.ts tests/server.test.ts --reporter=verbose
```

Result:

```text
Test Files  4 passed (4)
Tests       20 passed (20)
```

Gateway verification commands:

```text
npm run lint
npm run build
npm run test
```

Result:

```text
lint: exit 0, no findings
build: exit 0
test: 6 files passed, 57 tests passed
```

The first lint run reported three implementation/test typing issues. They were corrected, then lint, build, and the full test suite were rerun successfully.

## Implementation summary

- Added a 300,000 ms TTL cache with a 1,000-entry cap and deterministic oldest-entry eviction.
- Added a FIFO limiter with a default provider-call concurrency of four.
- Added strict request and provider-response validation, a versioned route-only cache key, one retry only for provider timeout/unavailable errors, stable sanitized errors, and one response `queriedAt` value.
- Added a side-effect-free-on-import `node:http` server factory, explicit production start function/entry behavior, unauthenticated secret-free health check, SHA-256 fixed-length timing-safe Bearer comparison, 16 KiB request limit, one JSON parse, and stable JSON error/status mapping.
- Added tests for all Task 6 behaviors, including secret/raw-provider non-disclosure.

## Self-review concerns

- The cache and limiter are process-local by design; restarts clear cached results and multiple gateway replicas do not coordinate concurrency. This matches the brief but should be revisited before horizontally scaling the gateway.
- Concurrent identical cache misses are not coalesced, so they can consume more than one of the four provider slots. The limiter still enforces the required maximum, and request coalescing was not part of Task 6.
- `INTERNAL_ERROR` maps to HTTP 500 in addition to the brief's explicitly named 400/401/502/503/504 mappings; this follows the existing public error contract and avoids misclassifying unknown gateway faults as provider faults.

## Reviewer fix — cached response isolation

### RED evidence

Added a service regression test that mutates nested option fields and injects extra properties into the first cache-miss response, then repeats the mutation against a cache-hit response. Before the fix:

```text
npm run test -- tests/service.test.ts --reporter=verbose

Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)
```

The next cache hit contained the miss caller's `priceCny: 1` mutation and injected fields, proving the service returned and cached the same mutable object graph.

### GREEN evidence

The service now uses Node's `structuredClone` at both cache ownership boundaries: it stores a clone on miss and returns a fresh clone on every hit. The generic cache remains unchanged.

```text
npm run test -- tests/service.test.ts tests/cache.test.ts --reporter=verbose

Test Files  2 passed (2)
Tests       9 passed (9)
```

The regression test also verifies that every later response equals the original data, passes the strict response schema, and has independent top-level, options-array, and nested-option references.

### Verification

```text
npm run test   # 6 files passed, 58 tests passed
npm run lint   # exit 0
npm run build  # exit 0
```
