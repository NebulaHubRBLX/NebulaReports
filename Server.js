// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files if needed

let reports = [];
const reportsFile = 'reports.json';

if (fs.existsSync(reportsFile)) {
    reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
}

app.post('/report', (req, res) => {
    const reportData = req.body;
    const id = reports.length + 1;
    reports.push({ id, data: reportData, executor: reportData.executor || { name: 'Unknown' } });
    fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
    res.json({ id });
});

app.get('/reports', (req, res) => {
    res.json(reports.map(r => ({ id: r.id, executor: r.executor.name })));
});

app.get('/report/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const report = reports.find(r => r.id === id);
    if (report) {
        res.json(report.data);
    } else {
        res.status(404).json({ error: 'Report not found' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
