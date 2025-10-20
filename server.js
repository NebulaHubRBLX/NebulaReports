const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

// Load existing reports or create empty array
const reportsFile = 'reports.json';
let reports = [];
if (fs.existsSync(reportsFile)) {
    reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
}

// POST /report -> create a new report
app.post('/report', (req, res) => {
    const reportData = req.body;
    const id = reports.length + 1;

    const report = {
        id,
        data: reportData,
        executor: reportData.executor || { name: 'Unknown' }
    };

    reports.push(report);
    fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));

    // Return the ID and full URL link
    const host = req.get('host'); // Get the host from the request
    const protocol = req.protocol;
    res.json({
        id,
        link: `${protocol}://${host}/report/${id}`
    });
});

// GET /reports -> list all reports
app.get('/reports', (req, res) => {
    res.json(reports.map(r => ({ id: r.id, executor: r.executor.name })));
});

// GET /report/:id -> serve HTML page for report
app.get('/report/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const report = reports.find(r => r.id === id);

    if (report) {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Report #${id}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #f2f2f2; }
                    h1 { color: #333; }
                    pre { background: #fff; padding: 15px; border-radius: 5px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>Report #${id}</h1>
                <h2>Executor: ${report.executor.name}</h2>
                <pre>${JSON.stringify(report.data, null, 2)}</pre>
            </body>
            </html>
        `);
    } else {
        res.status(404).send('<h1>Report not found</h1>');
    }
});

// GET / -> serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
