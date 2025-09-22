const express = require('express');
const path = require('path');

const app = express();
const STATIC_DIR = path.join(__dirname, '..', 'static');

// Serve static files
app.use('/static', express.static(STATIC_DIR));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.get('/firstscan', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'first.html'));
});

app.get('/manager', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'manager.html'));
});

app.get('/lastscan', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'last.html'));
});

// Start server
const port = 3000;
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`STATIC_DIR is: ${STATIC_DIR}`);
});