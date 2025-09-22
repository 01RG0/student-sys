const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, 'server.log');
    this.eventsFile = path.join(logDir, 'events.jsonl');
  }

  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    // Write to server log
    fs.appendFileSync(
      this.logFile,
      `[${timestamp}] ${level.toUpperCase()}: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      }\n`
    );

    return logEntry;
  }

  info(message, meta) { return this.log('info', message, meta); }
  warn(message, meta) { return this.log('warn', message, meta); }
  error(message, meta) { return this.log('error', message, meta); }

  event(type, payload, meta = {}) {
    const event = {
      type,
      payload,
      ts: new Date().toISOString(),
      ...meta
    };

    // Write to events log
    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n');

    return event;
  }

  // Read recent events, optionally filtered by timestamp
  getEvents(since = null, limit = 1000) {
    const events = [];
    if (fs.existsSync(this.eventsFile)) {
      const lines = fs.readFileSync(this.eventsFile, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .reverse() // Most recent first
        .slice(0, limit);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (!since || (event.ts && event.ts >= since)) {
            events.push(event);
          }
        } catch (e) {
          this.error('Failed to parse event line', { line, error: e.message });
        }
      }
    }
    return events;
  }

  // Clear all logs (used during reset)
  clear() {
    fs.writeFileSync(this.logFile, '');
    fs.writeFileSync(this.eventsFile, '');
  }
}

module.exports = Logger;