import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

# Optional heavy deps isolated so app can start without them if not needed yet
try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # lazy import later

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "storage"
STATIC_DIR = BASE_DIR / "static"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Student System Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        self.node_info: Dict[str, Dict[str, Any]] = {}
        self._counter = 0

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        node_id = f"n{self._counter}"
        self._counter += 1
        self.active_connections[node_id] = websocket
        return node_id

    def register_node(self, node_id: str, name: str, role: str) -> None:
        self.node_info[node_id] = {
            "nodeId": node_id,
            "name": name,
            "role": role,
            "lastSeen": datetime.now(timezone.utc).isoformat(),
        }

    def disconnect(self, node_id: str) -> None:
        self.active_connections.pop(node_id, None)
        self.node_info.pop(node_id, None)

    async def broadcast(self, message: Dict[str, Any], roles: List[str] | None = None) -> None:
        dead: List[str] = []
        for node_id, ws in self.active_connections.items():
            if roles is not None:
                info = self.node_info.get(node_id)
                if not info or info.get("role") not in roles:
                    continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(node_id)
        for node_id in dead:
            self.disconnect(node_id)


conn_mgr = ConnectionManager()
REQUIRED_TOKEN = os.getenv("NODE_TOKEN", "").strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# In-memory state
cache: Dict[str, Any] = {"version": 0, "students": []}


def load_cache() -> None:
    cache_file = STORAGE_DIR / "students_cache.json"
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            cache.clear()
            cache.update(data)
        except Exception:
            pass


def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def save_cache() -> None:
    _atomic_write_json(STORAGE_DIR / "students_cache.json", cache)


def append_event(event: Dict[str, Any]) -> None:
    events_path = STORAGE_DIR / "events.jsonl"
    with events_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def load_state() -> Dict[str, Any]:
    state_path = STORAGE_DIR / "state.json"
    if state_path.exists():
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state: Dict[str, Any]) -> None:
    _atomic_write_json(STORAGE_DIR / "state.json", state)


def excel_to_cache_rows(file_path: Path) -> List[Dict[str, Any]]:
    global pd
    if pd is None:
        import importlib
        pd = importlib.import_module("pandas")
    df = pd.read_excel(file_path)
    # Normalize columns to lower for mapping
    normalized = {str(c).strip().lower(): c for c in df.columns}

    def pick(*names: str) -> str | None:
        for name in names:
            if name in normalized:
                return normalized[name]
        return None

    col_id = pick("student id", "id", "studentid")
    if not col_id:
        raise HTTPException(status_code=400, detail="Student ID column not found")
    col_name = pick("name", "full name")
    col_grade = pick("grade")
    col_class = pick("class", "class name")
    col_reg = pick("registration", "registration status")
    col_hw = pick("homework", "homework status")

    rows: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        student_id = str(r[col_id]).strip()
        if not student_id or student_id.lower() == "nan":
            continue
        row: Dict[str, Any] = {
            "studentId": student_id,
            "fullName": str(r[col_name]).strip() if col_name else None,
            "grade": str(r[col_grade]).strip() if col_grade else None,
            "className": str(r[col_class]).strip() if col_class else None,
            "registrationStatus": str(r[col_reg]).strip().lower() if col_reg else "unknown",
            "homeworkStatus": str(r[col_hw]).strip().lower() if col_hw else "unknown",
            "lastUpdatedAt": now_iso(),
        }
        rows.append(row)
    return rows


@app.on_event("startup")
async def on_startup() -> None:
    load_cache()


@app.get("/")
async def root() -> HTMLResponse:
    return FileResponse(STATIC_DIR / "manager.html")


@app.get("/first")
async def first_page() -> HTMLResponse:
    return FileResponse(STATIC_DIR / "first.html")


@app.get("/last")
async def last_page() -> HTMLResponse:
    return FileResponse(STATIC_DIR / "last.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    node_id = await conn_mgr.connect(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "welcome", "nodeId": node_id}))
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            mtype = msg.get("type")
            if mtype == "register":
                node = msg.get("node", {})
                name = str(node.get("name", f"node-{node_id}"))
                role = str(node.get("role", "first_scan"))
                token = str(msg.get("token", ""))
                if REQUIRED_TOKEN and token != REQUIRED_TOKEN:
                    await websocket.send_text(json.dumps({
                        "type": "log",
                        "message": "Unauthorized: invalid token",
                        "ts": now_iso(),
                    }))
                    await websocket.close()
                    break
                conn_mgr.register_node(node_id, name, role)
                # send current cache on register for first/last
                await websocket.send_text(json.dumps({"type": "cache", **cache}))
                await websocket.send_text(json.dumps({
                    "type": "log",
                    "message": f"Registered {name} ({role})",
                    "ts": now_iso(),
                }))
            elif mtype == "cache_request":
                await websocket.send_text(json.dumps({"type": "cache", **cache}))
            elif mtype == "student_record":
                payload = msg.get("payload", {})
                # Append event and update aggregate state
                event = {
                    "type": "student_record",
                    "payload": payload,
                    "ts": now_iso(),
                    "sourceNodeId": node_id,
                }
                append_event(event)
                state = load_state()
                sid = payload.get("studentId")
                if sid:
                    state[sid] = {
                        "studentId": sid,
                        "registrationStatus": payload.get("registrationStatus", "unknown"),
                        "homeworkStatus": payload.get("homeworkStatus", "unknown"),
                        "comment": payload.get("comment"),
                        "lastUpdatedAt": now_iso(),
                        "source": payload.get("source"),
                    }
                    save_state(state)
                # Forward to last scan
                await conn_mgr.broadcast({
                    "type": "forward_student_record",
                    "payload": payload,
                    "ts": now_iso(),
                }, roles=["last_scan"])
            elif mtype == "heartbeat":
                info = conn_mgr.node_info.get(node_id)
                if info:
                    info["lastSeen"] = now_iso()
            else:
                await websocket.send_text(json.dumps({"type": "log", "message": f"Unknown type {mtype}", "ts": now_iso()}))
    except WebSocketDisconnect:
        pass
    finally:
        conn_mgr.disconnect(node_id)


@app.post("/api/upload-excel")
async def upload_excel(file: UploadFile = File(...)) -> JSONResponse:
    # Save temp
    suffix = Path(file.filename or "students.xlsx").suffix or ".xlsx"
    temp_path = STORAGE_DIR / f"upload{suffix}"
    with temp_path.open("wb") as f:
        f.write(await file.read())

    # Convert
    rows = excel_to_cache_rows(temp_path)
    cache["version"] = int(cache.get("version", 0)) + 1
    cache["students"] = rows
    save_cache()

    # Broadcast cache update
    await conn_mgr.broadcast({
        "type": "cache_update",
        "version": cache["version"],
        "students": rows,
    }, roles=["first_scan"])

    return JSONResponse({"version": cache["version"], "studentsCount": len(rows)})


@app.get("/api/cache")
async def get_cache() -> JSONResponse:
    return JSONResponse(cache)


@app.get("/api/state")
async def get_state() -> JSONResponse:
    return JSONResponse(load_state())


@app.get("/api/events")
async def get_events() -> FileResponse:
    events_path = STORAGE_DIR / "events.jsonl"
    if not events_path.exists():
        events_path.write_text("", encoding="utf-8")
    return FileResponse(events_path)


@app.get("/api/events_json")
async def get_events_json(since: str | None = None) -> JSONResponse:
    """Return events as JSON array. Optional since ISO timestamp filter."""
    events_path = STORAGE_DIR / "events.jsonl"
    results: List[Dict[str, Any]] = []
    if events_path.exists():
        for line in events_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                evt = json.loads(line)
            except Exception:
                continue
            if since:
                try:
                    if evt.get("ts") and evt["ts"] < since:
                        continue
                except Exception:
                    pass
            results.append(evt)
    return JSONResponse({"events": results})


# Serve static files directory for assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


