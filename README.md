## Student System - Manager/First Scan/Last Scan

Run the system on a local network (LAN) with no internet required. All laptops connect to the Manager's web server.

### Prerequisites
- Windows 10/11
- Python 3.10+ (installed as `py` launcher)

### 1) Setup (first time)
Open PowerShell in the project folder:

```powershell
cd "C:\Users\hamad\Desktop\student system"

py -3 -m venv .venv
.\.venv\Scripts\python.exe -m ensurepip --default-pip
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" pandas openpyxl python-multipart
```

### 2) Start the server (Manager device)
```powershell
cd "C:\Users\hamad\Desktop\student system"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### Optional: HTTPS/WSS on LAN
Generate a self‑signed certificate (Windows PowerShell):
```powershell
mkdir ssl
powershell -Command "New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation Cert:\LocalMachine\My | ForEach-Object { $pwd = ConvertTo-SecureString -String 'password' -Force -AsPlainText; Export-PfxCertificate -Cert $_ -FilePath .\ssl\cert.pfx -Password $pwd }"
# Convert PFX to PEM (requires OpenSSL; if not available, you can use Windows cert export wizard):
openssl pkcs12 -in .\ssl\cert.pfx -out .\ssl\cert.pem -clcerts -nokeys -passin pass:password
openssl pkcs12 -in .\ssl\cert.pfx -out .\ssl\key.pem -nocerts -nodes -passin pass:password
```

Run with SSL (port 8443 by default):
```powershell
./scripts/run_ssl.ps1 -Host 0.0.0.0 -Port 8443 -CertFile './ssl/cert.pem' -KeyFile './ssl/key.pem'
```

Then open:
- Manager: `https://localhost:8443` (accept the browser warning for self-signed cert)
- First/Last: `https://<MANAGER_IP>:8443/first` and `/last`

### 3) Open the UIs
- Manager device: `http://localhost:8000` or `http://127.0.0.1:8000`
  - Choose Excel file → Upload & Distribute (converts to JSON and broadcasts to First Scans)
- First Scan (black laptops): `http://<MANAGER_IP>:8000/first`
  - Receives cache in real-time, can send student records (manual or scanner later)
- Last Scan (purple laptop): `http://<MANAGER_IP>:8000/last`
  - Displays incoming student records as they arrive

Find `<MANAGER_IP>` with:
```powershell
ipconfig
```
Use the IPv4 address of the network you all share (e.g., `192.168.1.10`). All machines must be on the same router/Wi‑Fi.

### Important: Do NOT use 0.0.0.0 in the browser
- `0.0.0.0` is only a server bind address. It is not a valid URL to open in the browser.
- On the Manager device, open: `http://localhost:8000` or `http://127.0.0.1:8000`.
- From other laptops, open: `http://<MANAGER_IP>:8000` (replace with the Manager IPv4).

### Files of interest
- `static/manager.html` → Manager UI (upload + logs)
- `static/first.html` → First Scan minimal UI
- `static/last.html` → Last Scan minimal UI
- `backend/app/main.py` → FastAPI app (WebSocket routing, upload, cache, storage)
- `storage/` → Created at runtime (`students_cache.json`, `events.jsonl`, `state.json`)
- `specs/schemas.md` → Data models/messages
- `specs/protocols.md` → Protocols and endpoints

### Excel format
- Header names are auto-detected (case-insensitive):
  - `Student ID` / `ID` → `studentId` (required)
  - `Name` / `Full Name` → `fullName`
  - `Grade` → `grade`
  - `Class` → `className`
  - `Registration` → `registrationStatus`
  - `Homework` → `homeworkStatus`

### Troubleshooting
- No module named uvicorn → install: `.\.venv\Scripts\python.exe -m pip install "uvicorn[standard]"`
- Form data requires python-multipart → install: `.\.venv\Scripts\python.exe -m pip install python-multipart`
- Opened `http://0.0.0.0:8000` and it shows nothing → open `http://localhost:8000` (or `http://<MANAGER_IP>:8000` from other laptops)
- Firewall blocks LAN access → allow Python through Windows Defender Firewall, or use a different port (e.g., `--port 8080`).
- Verify server is up: open `http://localhost:8000` on the Manager device.
- Direct file test (bypasses root route): `http://localhost:8000/static/manager.html`
- SSL errors / certificate warnings: expected with self-signed certs; click "Proceed". For stricter security, install the generated CA into Trusted Root on each laptop.

### Troubleshooting commands (PowerShell)

Recreate the virtual environment (fixes broken pip or site-packages):
```powershell
cd "C:\Users\hamad\Desktop\student system"
if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }
py -3 -m venv .venv --upgrade-deps
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" pandas openpyxl python-multipart
```

If pip is missing/broken inside venv:
```powershell
.\.venv\Scripts\python.exe -m ensurepip --default-pip
# (fallback) download and run get-pip
Invoke-WebRequest -UseBasicParsing -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile get-pip.py
.\.venv\Scripts\python.exe .\get-pip.py
```

Verify imports work in venv:
```powershell
.\.venv\Scripts\python.exe -c "import fastapi, uvicorn; print('OK')"
```

Start server on an alternate port (if 8000 is busy):
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8080
```

Find process using a port and kill it:
```powershell
netstat -ano | findstr :8000
# note the last column (PID), then
taskkill /PID <PID_FROM_ABOVE> /F
```

Check your LAN IP (to use on other laptops):
```powershell
ipconfig
```

Quick HTTP check from Manager device:
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000 | Select-Object -Property StatusCode
```

### Notes
- Works offline on LAN: Manager serves the web app; First/Last Scan connect to Manager over WebSocket/HTTP.
- Current storage is JSON files; SQLite can be added later if needed.


