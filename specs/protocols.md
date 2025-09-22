### Network topology (LAN-first, offline-capable)

- All nodes (Manager, First Scan, Last Scan) connect to the same router on a local network. No internet required.
- Manager exposes HTTP and WebSocket on its LAN IP (e.g., `http://192.168.1.10:8000`).
- First/Last Scan open the web UI served by Manager and connect back via WS.

### Authentication

- Lightweight shared token (optional in LAN):
  - Header `X-Node-Token` for HTTP
  - Field `token` in WS register message
  - Roles: `first_scan`, `last_scan`, `manager`

### WebSocket message types

- Client → Manager
  - `register`: identify node `{name, role}`
  - `cache_request`: ask for current cache
  - `student_record`: send scanned record
  - `heartbeat`: liveness

- Manager → Client
  - `welcome`: connection accepted, assigned `nodeId`
  - `cache`: full cache snapshot
  - `cache_update`: new cache broadcast after Excel upload
  - `forward_student_record`: routed event to Last Scan
  - `log`: informational messages for UIs

### REST endpoints (Manager)

- `POST /api/upload-excel` → multipart form, returns `{version, studentsCount}` and triggers `cache_update`
- `GET /api/cache` → current cache JSON
- `GET /api/state` → current aggregate state
- `GET /api/events` → tail `events.jsonl` (optional `since` parameter)

### Failure and replay

- If Last Scan is offline, Manager appends events to `events.jsonl`. On Last Scan reconnect, it requests `GET /api/events?since=lastTs` or receives a `replay` over WS.
- Heartbeats every 15s; disconnect after 45s idle.

### Timing

- End-to-end First Scan → Last Scan routing within 2s target.


