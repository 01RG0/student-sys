const path = require('path');
const http = require('http');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { WebSocketServer } = require('ws');
const { Server: IOServer } = require('socket.io');

const Logger = require('./logger');
const StateManager = require('./state');
const StudentValidator = require('./validator');

// Initialize paths
const BASE_DIR = path.resolve(__dirname, '..');
const STORAGE_DIR = path.join(BASE_DIR, 'storage');
const STATIC_DIR = path.join(BASE_DIR, 'static');
const LOG_DIR = path.join(BASE_DIR, 'logs');

// Initialize components
const logger = new Logger(LOG_DIR);
const state = new StateManager(STORAGE_DIR);
const REQUIRED_TOKEN = (process.env.NODE_TOKEN || '').trim();

// Express setup
const app = express();
app.use(express.json());
app.use('/static', express.static(STATIC_DIR));

// Create HTTP server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const io = new IOServer(server, { cors: { origin: '*' } });

// Track connections
const connections = new Map(); // nodeId -> ws
const nodeInfo = new Map(); // nodeId -> {name, role}
let nextId = 0;

app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
app.get('/manager', (req, res) => res.sendFile(path.join(STATIC_DIR, 'manager.html')));
app.get('/firstscan', (req, res) => res.sendFile(path.join(STATIC_DIR, 'first.html')));
app.get('/lastscan', (req, res) => res.sendFile(path.join(STATIC_DIR, 'last.html')));

// Upload Excel
const upload = multer({ dest: path.join(STORAGE_DIR, 'uploads') });
app.post('/api/upload-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      logger.warn('Excel upload attempted without file');
      return res.status(400).json({ error: 'File is required' });
    }

    // Read Excel file
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Validate and transform rows
    const validRows = [];
    const errors = [];
    
    arr.forEach((row, index) => {
      try {
        const validRow = StudentValidator.validateExcelRow(row);
        if (validRow.studentId) {
          validRows.push(validRow);
        }
      } catch (e) {
        errors.push(`Row ${index + 1}: ${e.message}`);
      }
    });

    if (validRows.length === 0) {
      logger.error('Excel upload failed - no valid rows', { errors });
      return res.status(400).json({ 
        error: 'No valid student records found in file',
        details: errors
      });
    }

    // Update cache with valid rows
    const updatedCache = state.updateCache(validRows);
    
    // Log the update
    logger.info('Excel file processed', {
      totalRows: arr.length,
      validRows: validRows.length,
      errors: errors.length,
      cacheVersion: updatedCache.version
    });

    // Broadcast to first scan nodes
    broadcast({
      type: 'cache_update',
      version: updatedCache.version,
      students: validRows
    }, ['first_scan']);

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      logger.warn('Failed to clean up upload file', { path: req.file.path });
    }

    res.json({
      version: updatedCache.version,
      studentsCount: validRows.length,
      errors: errors.length ? errors : undefined
    });

  } catch (e) {
    logger.error('Excel upload failed', { error: e.message });
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

app.get('/api/cache', (req, res) => res.json(cache));
app.get('/api/state', (req, res) => res.json(loadState()));
app.get('/api/nodes', (req, res) => {
  const list = [];
  for (const [id, info] of nodeInfo.entries()) list.push({ nodeId: id, ...info });
  res.json({ nodes: list });
});
app.get('/api/events', (req, res) => {
  const p = path.join(STORAGE_DIR, 'events.jsonl');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '');
  res.sendFile(p);
});
app.get('/api/events_json', (req, res) => {
  const since = req.query.since;
  const p = path.join(STORAGE_DIR, 'events.jsonl');
  const out = [];
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      try { const e = JSON.parse(line); if (!since || (e.ts && e.ts >= since)) out.push(e); } catch {}
    });
  }
  res.json({ events: out });
});

// Backup/export endpoints
// Backup endpoints
app.get('/api/backup/:format', (req, res) => {
  try {
    const format = req.params.format;
    
    // Get current timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    switch (format) {
      case 'json': {
        const data = state.exportState('json');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="student-data-${timestamp}.json"`);
        res.send(data);
        break;
      }

      case 'csv': {
        const data = state.exportState('csv');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="student-data-${timestamp}.csv"`);
        res.send(data);
        break;
      }

      case 'excel': {
        // Get state data
        const currentState = state.getState();
        const rows = Object.values(currentState);

        // Create workbook with multiple sheets
        const wb = XLSX.utils.book_new();

        // Add main data sheet
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Students');

        // Add statistics sheet
        const stats = {
          'Total Students': rows.length,
          'Registered': rows.filter(r => r.registrationStatus === 'registered').length,
          'Not Registered': rows.filter(r => r.registrationStatus === 'not_registered').length,
          'Unknown Registration': rows.filter(r => r.registrationStatus === 'unknown').length,
          'Homework Done': rows.filter(r => r.homeworkStatus === 'done').length,
          'Homework Not Done': rows.filter(r => r.homeworkStatus === 'not_done').length,
          'Unknown Homework': rows.filter(r => r.homeworkStatus === 'unknown').length,
          'Export Time': new Date().toISOString()
        };
        const statsWs = XLSX.utils.aoa_to_sheet(
          Object.entries(stats).map(([k, v]) => [k, v])
        );
        XLSX.utils.book_append_sheet(wb, statsWs, 'Statistics');

        // Write to buffer
        const buf = XLSX.write(wb, {
          type: 'buffer',
          bookType: 'xlsx'
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="student-data-${timestamp}.xlsx"`);
        res.send(buf);
        break;
      }

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    logger.info('Backup created', {
      format,
      timestamp
    });

  } catch (e) {
    logger.error('Backup failed', { error: e.message });
    res.status(500).json({
      error: 'Failed to create backup',
      details: e.message
    });
  }
});

// System reset
app.post('/api/reset', (req, res) => {
  try {
    // Clear all state
    state.reset();
    
    // Clear logs
    logger.clear();
    
    // Log the reset
    logger.info('System reset performed');
    
    // Broadcast reset to all nodes
    broadcast({
      type: 'system_reset',
      ts: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (e) {
    logger.error('Reset failed', { error: e.message });
    res.status(500).json({
      error: 'Failed to reset system',
      details: e.message
    });
  }
});

function broadcast(message, roles) {
  for (const [id, ws] of connections.entries()) {
    if (roles) {
      const info = nodeInfo.get(id);
      if (!info || !roles.includes(info.role)) continue;
    }
    try { ws.send(JSON.stringify(message)); } catch {}
  }
  io.sockets.sockets.forEach((sock) => {
    const info = nodeInfo.get(sock.id);
    if (roles && (!info || !roles.includes(info.role))) return;
    try { sock.emit('message', message); } catch {}
  });
}

wss.on('connection', (ws) => {
  const nodeId = `n${nextId++}`;
  connections.set(nodeId, ws);

  // Helper to send message to this connection
  const send = (msg) => {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      logger.error('Failed to send message', { nodeId, error: e.message });
    }
  };

  send({ type: 'welcome', nodeId });
  logger.info('New connection established', { nodeId });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch (e) {
      logger.warn('Received invalid JSON', { nodeId });
      return;
    }

    const type = msg.type;
    
    try {
      switch (type) {
        case 'register': {
          // Validate token
          const token = String(msg.token || '');
          if (REQUIRED_TOKEN && token !== REQUIRED_TOKEN) {
            logger.warn('Invalid token received', { nodeId });
            send({ 
              type: 'log',
              message: 'Unauthorized: invalid token',
              level: 'error',
              ts: new Date().toISOString()
            });
            ws.close();
            return;
          }

          // Register node
          const node = msg.node || {};
          const name = String(node.name || `node-${nodeId}`);
          const role = String(node.role || 'first_scan');

          nodeInfo.set(nodeId, { name, role, lastSeen: new Date().toISOString() });
          
          // Send current cache
          const currentCache = state.getCache();
          send({ type: 'cache', ...currentCache });

          logger.info('Node registered', { nodeId, name, role });
          send({
            type: 'log',
            message: `Registered as ${name} (${role})`,
            ts: new Date().toISOString()
          });
          break;
        }

        case 'cache_request': {
          const currentCache = state.getCache();
          send({ type: 'cache', ...currentCache });
          logger.info('Cache requested', { nodeId });
          break;
        }

        case 'student_record': {
          const info = nodeInfo.get(nodeId);
          if (!info) {
            logger.warn('Unregistered node sent record', { nodeId });
            return;
          }

          try {
            // Validate record
            const validRecord = StudentValidator.validateRecord(msg.payload || {});
            
            // Create event
            const event = logger.event('student_record', validRecord, {
              sourceNodeId: nodeId,
              sourceName: info.name,
              sourceRole: info.role
            });

            // Update state
            state.updateStudent(validRecord.studentId, validRecord);

            // Forward to Last Scan nodes
            broadcast({
              type: 'forward_student_record',
              payload: validRecord,
              ts: new Date().toISOString()
            }, ['last_scan']);

            logger.info('Student record processed', {
              nodeId,
              studentId: validRecord.studentId
            });

          } catch (e) {
            logger.error('Invalid student record', {
              nodeId,
              error: e.message,
              payload: msg.payload
            });
            send({
              type: 'log',
              message: `Error: ${e.message}`,
              level: 'error',
              ts: new Date().toISOString()
            });
          }
          break;
        }

        default:
          logger.warn('Unknown message type', { nodeId, type });
      }
    } catch (e) {
      logger.error('Error processing message', {
        nodeId,
        type,
        error: e.message
      });
    }
  });

  ws.on('close', () => {
    const info = nodeInfo.get(nodeId);
    if (info) {
      logger.info('Node disconnected', {
        nodeId,
        name: info.name,
        role: info.role
      });
    }
    connections.delete(nodeId);
    nodeInfo.delete(nodeId);
  });
});

// Socket.IO channel (mirrors WS protocol)
io.on('connection', (socket) => {
  const nodeId = socket.id;
  socket.emit('message', { type: 'welcome', nodeId });

  socket.on('message', (msg) => {
    const type = msg && msg.type;
    if (type === 'register') {
      const token = String(msg.token || '');
      if (REQUIRED_TOKEN && token !== REQUIRED_TOKEN) {
        socket.emit('message', { type: 'log', message: 'Unauthorized: invalid token', ts: nowIso() });
        socket.disconnect(true);
        return;
      }
      const node = msg.node || {}; const name = String(node.name || `node-${nodeId}`); const role = String(node.role || 'first_scan');
      nodeInfo.set(nodeId, { name, role });
      socket.emit('message', { type: 'cache', ...cache });
      socket.emit('message', { type: 'log', message: `Registered ${name} (${role})`, ts: nowIso() });
    } else if (type === 'cache_request') {
      socket.emit('message', { type: 'cache', ...cache });
    } else if (type === 'student_record') {
      const payload = msg.payload || {};
      const event = { type: 'student_record', payload, ts: nowIso(), sourceNodeId: nodeId };
      appendEvent(event);
      const state = loadState();
      const sid = payload.studentId;
      if (sid) {
        state[sid] = {
          studentId: sid,
          registrationStatus: payload.registrationStatus || 'unknown',
          homeworkStatus: payload.homeworkStatus || 'unknown',
          comment: payload.comment || '',
          lastUpdatedAt: nowIso(),
          source: payload.source,
        };
        saveState(state);
      }
      broadcast({ type: 'forward_student_record', payload, ts: nowIso() }, ['last_scan']);
    }
  });

  socket.on('disconnect', () => { nodeInfo.delete(nodeId); });
});

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Node server listening on http://${HOST}:${PORT}`);
});


