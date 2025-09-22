# Student System - Node.js Version Setup

A local network-based system for tracking student attendance and status using QR code scanning. This version uses Node.js for the backend server.

## Quick Start (Node.js Version)

### 1. Prerequisites

- Node.js (v14 or higher)
- Windows 10/11
- Web browser with camera access
- Local network connection between devices

### 2. First-time Setup

Open PowerShell in the project folder and run:

```powershell
# Allow npm scripts to run (if needed)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# Initialize project and install dependencies
cd "C:\Users\hamad\Desktop\student system"
npm init -y
npm install express ws multer xlsx socket.io
```

### 3. Start the Server (Manager Device)

```powershell
node server/index.js
```

The server will start on port 3000 by default.

### 4. Access the System

On the Manager device:
- Manager Dashboard: `http://localhost:3000/manager`
- First Scan: `http://localhost:3000/firstscan`
- Last Scan: `http://localhost:3000/lastscan`
http://127.0.0.1:3000/first
http://localhost:3000/first
http://[your-ip]:3000/first (get your IP using ipconfig)

From other devices on the network:
- Replace `localhost` with the Manager's IP address
- Example: `http://<MANAGER_IP>:3000/firstscan`

To find the Manager's IP address:
```powershell
ipconfig
# Look for IPv4 Address under your active network adapter
```

## System Components

### 1. Manager Dashboard (/manager)
- Upload student lists (Excel format)
- Monitor connected scanning nodes
- Real-time status updates
- Export results (JSON/CSV)

### 2. First Scan Node (/first)
- QR/Barcode scanning
- Student validation
- Registration status tracking
- Homework status recording
- Offline capability

### 3. Last Scan Node (/last)
- QR/Barcode scanning
- Progress tracking
- Validation against records
- Export capabilities

## Troubleshooting

### Common Issues

1. **Module Not Found Errors**
   ```powershell
   npm install express ws multer xlsx socket.io
   ```

2. **Permission Issues**
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

3. **Port Already in Use**
   Find and kill the process:
   ```powershell
   netstat -ano | findstr :3000
   taskkill /PID <PID_NUMBER> /F
   ```

4. **Network Access Issues**
   - Ensure Windows Firewall allows Node.js
   - Verify all devices are on the same network
   - Check server IP address is correct

### Verification Steps

1. Test server is running:
   ```powershell
   curl http://localhost:3000
   ```

2. Check installed packages:
   ```powershell
   npm list --depth=0
   ```

3. Verify network access:
   ```powershell
   Test-NetConnection -ComputerName <MANAGER_IP> -Port 3000
   ```

## File Structure

```
student system/
├── server/
│   └── index.js         # Main server file
├── static/
│   ├── css/
│   │   └── app.css     # Styles
│   ├── first.html      # First Scan UI
│   ├── last.html       # Last Scan UI
│   ├── manager.html    # Manager UI
│   └── index.html      # Landing page
├── storage/
│   ├── students_cache.json  # Student data cache
│   └── uploads/            # Uploaded files
└── package.json           # Node.js dependencies
```

## Excel File Format

Required columns:
- `Student ID` or `ID`
- `Name` or `Full Name`
- `Grade` (optional)
- `Class` (optional)
- `Registration` (optional)
- `Homework` (optional)

## Security Notes

- System runs on local network only
- No internet connection required
- Data stored locally in JSON files
- Optional token-based authentication

## Tips for Best Performance

1. **Scanner Setup**
   - Good lighting
   - Clean camera lens
   - Stable QR code positioning

2. **Network Performance**
   - Keep devices close to router
   - Minimize network congestion
   - Use 5GHz Wi-Fi if available

3. **Data Management**
   - Regular exports
   - Clear cache periodically
   - Backup important data

## Support

For technical issues:
1. Check error messages in browser console
2. Verify network connectivity
3. Restart server if needed
4. Check system requirements