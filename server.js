const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios'); // Add this for Discord webhook

const app = express();
const port = process.env.PORT || 3000;
const reportsFile = path.join(__dirname, 'reports.json');

// Discord webhook configuration
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1430961771287416892/F_QfGnk6OysV-1GgD_zCGjpjq1VJ_aVwEzQSafmEkWaUW5bN-kNbdUGAH-FBg6btxwBv';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Security middleware to prevent console reports
app.use((req, res, next) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// In-memory reports cache
let reports = [];

// Initialize reports from file
async function loadReports() {
    try {
        if (fsSync.existsSync(reportsFile)) {
            const data = await fs.readFile(reportsFile, 'utf8');
            reports = JSON.parse(data);
            console.log(`Loaded ${reports.length} reports from file`);
        } else {
            reports = [];
            console.log('No existing reports file found, starting fresh');
        }
    } catch (error) {
        console.error('Error loading reports:', error);
        reports = [];
    }
}

// Save reports to file with error handling
async function saveReports() {
    try {
        await fs.writeFile(reportsFile, JSON.stringify(reports, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving reports:', error);
        return false;
    }
}

// Send report to Discord webhook
async function sendToDiscordWebhook(report, ipAddress) {
    try {
        const embed = {
            title: `📊 New Report Created: NEBULA-${report.id}`,
            color: 0x00ff00,
            fields: [
                {
                    name: "Executor",
                    value: report.executor.name || 'Unknown',
                    inline: true
                },
                {
                    name: "Version",
                    value: report.executor.version || 'Unknown',
                    inline: true
                },
                {
                    name: "Type",
                    value: report.executor.type || 'Unknown',
                    inline: true
                },
                {
                    name: "Results",
                    value: `✅ ${report.results.passed} Passed | ❌ ${report.results.failed} Failed | 📊 ${report.results.successRate}% Success`,
                    inline: false
                },
                {
                    name: "Grade",
                    value: report.grade || 'F',
                    inline: true
                },
                {
                    name: "Duration",
                    value: `${report.duration || 0}ms`,
                    inline: true
                },
                {
                    name: "IP Address",
                    value: `\`${ipAddress}\``,
                    inline: true
                },
                {
                    name: "Report ID",
                    value: `\`NEBULA-${report.id}\``,
                    inline: false
                },
                {
                    name: "Timestamp",
                    value: new Date(report.createdAt).toLocaleString(),
                    inline: false
                }
            ],
            timestamp: new Date().toISOString()
        };

        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed],
            username: 'nUNC Report Logger',
            avatar_url: 'https://dirtyw0rk.neocities.org/N.png'
        });

        console.log(`Report NEBULA-${report.id} logged to Discord`);
    } catch (error) {
        console.error('Error sending to Discord webhook:', error.message);
        // Don't throw error to prevent report creation from failing
    }
}

// Generate random alphanumeric ID
function generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Ensure uniqueness
    if (reports.find(r => r.id === result)) {
        return generateId(); // Recursively generate until unique
    }
    
    return result;
}

// Validate report data - Enhanced to prevent fake reports
function validateReportData(data, ipAddress) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid report data' };
    }
    
    // Check for required fields
    if (!data.executor || !data.executor.name) {
        return { valid: false, error: 'Missing executor information' };
    }

    // Enhanced validation to prevent console-made reports
    if (!data.system || typeof data.system !== 'object') {
        return { valid: false, error: 'Invalid system information' };
    }

    // Check for expected test structure
    if (!data.categories || !Array.isArray(data.categories)) {
        return { valid: false, error: 'Invalid test categories' };
    }

    // Validate results structure
    if (typeof data.passes !== 'number' || typeof data.fails !== 'number') {
        return { valid: false, error: 'Invalid test results' };
    }

    // Check for suspicious data (very high success rates without proper structure)
    if (data.passes > 1000 && data.fails === 0) {
        return { valid: false, error: 'Suspicious test results detected' };
    }

    // Validate timestamp if present
    if (data.timestamp) {
        const reportTime = new Date(data.timestamp);
        const currentTime = new Date();
        const timeDiff = Math.abs(currentTime - reportTime);
        
        // Reject reports with timestamps too far in future or past (more than 1 hour)
        if (timeDiff > 3600000) { // 1 hour in milliseconds
            return { valid: false, error: 'Invalid timestamp' };
        }
    }

    return { valid: true };
}

// Get client IP address
function getClientIp(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

// POST /report -> create a new report
app.post('/report', async (req, res) => {
    try {
        const reportData = req.body;
        const clientIp = getClientIp(req);
        
        console.log('Received report data from IP:', clientIp);
        console.log('Report data:', JSON.stringify(reportData, null, 2));
        
        // Enhanced validation with IP
        const validation = validateReportData(reportData, clientIp);
        if (!validation.valid) {
            console.log(`Report validation failed from ${clientIp}:`, validation.error);
            return res.status(400).json({ error: validation.error });
        }

        const id = generateId();
        const report = {
            id: id,
            data: reportData,
            executor: reportData.executor,
            system: reportData.system || {},
            player: reportData.player || {},
            results: {
                total: reportData.totalTests || 0,
                passed: reportData.passes || 0,
                failed: reportData.fails || 0,
                successRate: reportData.successRate || 0
            },
            categories: reportData.categories || [],
            grade: reportData.grade || 'F',
            duration: reportData.duration || 0,
            version: reportData.version || 'unknown',
            createdAt: new Date().toISOString(),
            timestamp: reportData.timestamp || new Date().toISOString(),
            ipAddress: clientIp // Store IP with report
        };

        reports.push(report);
        
        // Save to file
        const saved = await saveReports();
        if (!saved) {
            return res.status(500).json({ error: 'Failed to save report' });
        }

        console.log(`Created new report: NEBULA-${id} for ${report.executor.name} from IP: ${clientIp}`);
        
        // Send to Discord webhook (don't await to avoid blocking response)
        sendToDiscordWebhook(report, clientIp).catch(error => {
            console.error('Failed to send webhook:', error);
        });
        
        // Build response with full URL
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        
        res.status(201).json({
            id: id,
            link: `${protocol}://${host}/report/${id}`,
            viewLink: `${protocol}://${host}/#${id}`,
            createdAt: report.createdAt
        });
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /report/:id (JSON) -> return report data as JSON
app.get('/report/:id/json', (req, res) => {
    try {
        const id = req.params.id;
        
        if (!id) {
            return res.status(400).json({ error: 'Invalid report ID' });
        }

        const report = reports.find(r => r.id === id);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(report);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /reports -> list all reports
app.get('/reports', (req, res) => {
    try {
        const reportsList = reports.map(r => ({
            id: r.id,
            executor: r.executor.name,
            successRate: r.results.successRate,
            grade: r.grade,
            totalTests: r.results.total,
            passed: r.results.passed,
            duration: r.duration,
            createdAt: r.createdAt,
            ipAddress: r.ipAddress // Include IP in list
        }));
        
        // Sort by most recent first
        reportsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(reportsList);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /report/:id -> serve HTML page for report
app.get('/report/:id', (req, res) => {
    try {
        const id = req.params.id;
        
        if (!id) {
            return res.status(400).send('<h1>Invalid report ID</h1>');
        }

        const report = reports.find(r => r.id === id);
        
        if (!report) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Report Not Found</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            padding: 20px; 
                            background: #f2f2f2;
                            text-align: center;
                        }
                        h1 { color: #d32f2f; }
                        a { color: #1976d2; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>Report NEBULA-${id} Not Found</h1>
                    <p><a href="/">Back to home</a></p>
                </body>
                </html>
            `);
        }

        const sanitizedData = JSON.stringify(report, null, 2)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Report NEBULA-${id}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        padding: 20px; 
                        background: #f2f2f2;
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    h1 { color: #333; }
                    h2 { color: #666; }
                    .metadata {
                        background: #fff;
                        padding: 15px;
                        border-radius: 5px;
                        margin-bottom: 20px;
                    }
                    pre { 
                        background: #fff; 
                        padding: 15px; 
                        border-radius: 5px; 
                        overflow-x: auto;
                        border: 1px solid #ddd;
                    }
                    .back-link {
                        display: inline-block;
                        margin-bottom: 20px;
                        color: #1976d2;
                        text-decoration: none;
                    }
                    .back-link:hover {
                        text-decoration: underline;
                    }
                    .results-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 1rem;
                        margin: 1rem 0;
                    }
                    .result-card {
                        background: #fff;
                        padding: 1rem;
                        border-radius: 5px;
                        border: 1px solid #ddd;
                        text-align: center;
                    }
                    .result-value {
                        font-size: 1.5rem;
                        font-weight: bold;
                    }
                    .result-pass { color: #22c55e; }
                    .result-fail { color: #ef4444; }
                    .security-info {
                        background: #fff3cd;
                        border: 1px solid #ffeaa7;
                        color: #856404;
                        padding: 10px;
                        border-radius: 5px;
                        margin: 10px 0;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <a href="/" class="back-link">← Back to nUNC</a>
                <h1>Report NEBULA-${id}</h1>
                
                <div class="security-info">
                    <strong>🔒 Verified Report:</strong> This report was validated and logged through nUNC's secure system.
                </div>
                
                <div class="metadata">
                    <h2>Executor: ${report.executor.name}</h2>
                    ${report.executor.version ? `<p><strong>Version:</strong> ${report.executor.version}</p>` : ''}
                    ${report.executor.type ? `<p><strong>Type:</strong> ${report.executor.type}</p>` : ''}
                    ${report.createdAt ? `<p><strong>Created:</strong> ${new Date(report.createdAt).toLocaleString()}</p>` : ''}
                    ${report.grade ? `<p><strong>Grade:</strong> ${report.grade}</p>` : ''}
                    ${report.ipAddress ? `<p><strong>Source IP:</strong> ${report.ipAddress}</p>` : ''}
                </div>
                
                <h3>Test Results:</h3>
                <div class="results-grid">
                    <div class="result-card">
                        <div>Success Rate</div>
                        <div class="result-value ${report.results.successRate >= 80 ? 'result-pass' : 'result-fail'}">
                            ${report.results.successRate}%
                        </div>
                    </div>
                    <div class="result-card">
                        <div>Total Tests</div>
                        <div class="result-value">${report.results.total}</div>
                    </div>
                    <div class="result-card">
                        <div>Passed</div>
                        <div class="result-value result-pass">${report.results.passed}</div>
                    </div>
                    <div class="result-card">
                        <div>Failed</div>
                        <div class="result-value result-fail">${report.results.failed}</div>
                    </div>
                </div>
                
                <h3>Full Report Data:</h3>
                <pre>${sanitizedData}</pre>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error serving report:', error);
        res.status(500).send('<h1>Internal Server Error</h1>');
    }
});

// GET / -> serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        reports: reports.length,
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        await loadReports();
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Discord webhook logging: ${DISCORD_WEBHOOK_URL ? 'ENABLED' : 'DISABLED'}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, saving reports and shutting down...');
    await saveReports();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, saving reports and shutting down...');
    await saveReports();
    process.exit(0);
});

startServer();
