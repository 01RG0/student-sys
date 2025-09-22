class StateManager {
  constructor(storageDir) {
    this.fs = require('fs');
    this.path = require('path');
    this.storageDir = storageDir;
    
    // Ensure storage directory exists
    if (!this.fs.existsSync(storageDir)) {
      this.fs.mkdirSync(storageDir, { recursive: true });
    }

    // Initialize state files
    this.cacheFile = this.path.join(storageDir, 'students_cache.json');
    this.stateFile = this.path.join(storageDir, 'state.json');
  }

  // Atomic file write
  atomicWrite(filepath, data) {
    const tmpPath = filepath + '.tmp';
    this.fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    this.fs.renameSync(tmpPath, filepath);
  }

  // Safe file read
  safeRead(filepath, defaultValue = {}) {
    try {
      return JSON.parse(this.fs.readFileSync(filepath, 'utf8'));
    } catch (e) {
      return defaultValue;
    }
  }

  // Cache operations
  getCache() {
    return this.safeRead(this.cacheFile, { version: 0, students: [] });
  }

  updateCache(students) {
    const cache = this.getCache();
    cache.version = Number(cache.version || 0) + 1;
    cache.students = students;
    this.atomicWrite(this.cacheFile, cache);
    return cache;
  }

  // State operations
  getState() {
    return this.safeRead(this.stateFile, {});
  }

  updateState(updates) {
    const state = this.getState();
    Object.assign(state, updates);
    this.atomicWrite(this.stateFile, state);
    return state;
  }

  updateStudent(studentId, data) {
    const state = this.getState();
    state[studentId] = {
      ...state[studentId],
      ...data,
      lastUpdatedAt: new Date().toISOString()
    };
    this.atomicWrite(this.stateFile, state);
    return state[studentId];
  }

  // Reset all state
  reset() {
    this.atomicWrite(this.cacheFile, { version: 0, students: [] });
    this.atomicWrite(this.stateFile, {});
  }

  // Export data
  exportState(format = 'json') {
    const state = this.getState();
    const students = Object.values(state);

    switch (format) {
      case 'json':
        return JSON.stringify(students, null, 2);

      case 'csv': {
        const headers = ['studentId', 'registrationStatus', 'homeworkStatus', 'comment', 'lastUpdatedAt'];
        return [
          headers.join(','),
          ...students.map(s => headers
            .map(h => String((s || {})[h] || '').replace(/"/g, '""'))
            .map(v => /[",\n]/.test(v) ? `"${v}"` : v)
            .join(','))
        ].join('\n');
      }

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

module.exports = StateManager;