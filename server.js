const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Create necessary directories
const uploadsDir = path.join(__dirname, 'uploads');
const batchesDir = path.join(__dirname, 'batches');
const tempDir = path.join(__dirname, 'temp');

[uploadsDir, batchesDir, tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const jobId = uuidv4();
        req.jobId = jobId;
        cb(null, `${jobId}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || path.extname(file.originalname) === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Date validation and formatting function
function validateAndFormatDate(dateStr, context) {
    if (!dateStr || dateStr.trim() === '') {
        throw new Error(`Empty date found in ${context}`);
    }
    
    // Remove any quotes and trim
    const cleanDate = dateStr.replace(/['"]/g, '').trim();
    
    // Check if already in YYYY-MM-DD format
    const isoFormat = /^\d{4}-\d{2}-\d{2}$/;
    if (isoFormat.test(cleanDate)) {
        // Validate that it's a real date
        const date = new Date(cleanDate);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format in ${context}: ${cleanDate}`);
        }
        return cleanDate;
    }
    
    // Try to parse other common formats and convert to YYYY-MM-DD
    let date;
    
    // Try DD/MM/YYYY or MM/DD/YYYY
    if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
            // Assume DD/MM/YYYY format (European)
            date = new Date(parts[2], parts[1] - 1, parts[0]);
            if (isNaN(date.getTime())) {
                // Try MM/DD/YYYY format (US)
                date = new Date(parts[2], parts[0] - 1, parts[1]);
            }
        }
    }
    
    // Try DD-MM-YYYY or MM-DD-YYYY
    else if (cleanDate.includes('-') && !isoFormat.test(cleanDate)) {
        const parts = cleanDate.split('-');
        if (parts.length === 3 && parts[0].length <= 2) {
            // Assume DD-MM-YYYY format
            date = new Date(parts[2], parts[1] - 1, parts[0]);
            if (isNaN(date.getTime())) {
                // Try MM-DD-YYYY format
                date = new Date(parts[2], parts[0] - 1, parts[1]);
            }
        }
    }
    
    if (!date || isNaN(date.getTime())) {
        throw new Error(`Unable to parse date format in ${context}: ${cleanDate}. Please use YYYY-MM-DD format.`);
    }
    
    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// CSV Processing Logic
function processCSV(csvFilePath, batchName, jobId) {
    return new Promise((resolve, reject) => {
        try {
            // Read CSV file
            const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
            const lines = csvContent.trim().split('\n');
            const header = lines[0];
            const rows = lines.slice(1);
            
            console.log(`Processing CSV: ${rows.length} rows`);
            
            // Parse CSV rows and validate date format
            const parsedRows = rows.map((line, index) => {
                // Simple CSV parsing - split by comma
                const columns = line.split(',');
                
                // Validate and normalize dates (columns 1 and 2 are checkin/checkout)
                if (columns.length > 2) {
                    columns[1] = validateAndFormatDate(columns[1], `Row ${index + 2}, checkin`);
                    columns[2] = validateAndFormatDate(columns[2], `Row ${index + 2}, checkout`);
                }
                
                return columns;
            });
            
            // Group by property_id (first column)
            const propertyBookings = {};
            parsedRows.forEach(row => {
                const propertyId = row[0];
                if (!propertyBookings[propertyId]) {
                    propertyBookings[propertyId] = [];
                }
                propertyBookings[propertyId].push(row);
            });
            
            const uniqueProperties = Object.keys(propertyBookings);
            console.log(`Unique properties: ${uniqueProperties.length}`);
            
            // Generate batches with constraints
            const batches = generateBatches(propertyBookings, header);
            
            // Create batch directory for this job
            const jobBatchDir = path.join(batchesDir, jobId);
            if (!fs.existsSync(jobBatchDir)) {
                fs.mkdirSync(jobBatchDir, { recursive: true });
            }
            
            // Save batches to files
            const batchFiles = [];
            batches.forEach((batch, index) => {
                const batchNum = (index + 1).toString().padStart(2, '0');
                
                // Get date range for filename
                const checkinDates = batch.map(row => row[1]); // checkin column
                const minDate = new Date(Math.min(...checkinDates.map(d => new Date(d))));
                const maxDate = new Date(Math.max(...checkinDates.map(d => new Date(d))));
                
                const minDay = minDate.getDate().toString().padStart(2, '0');
                const maxDay = maxDate.getDate().toString().padStart(2, '0');
                
                const filename = `${batchName}-${minDay}-${maxDay}-${batchNum}.csv`;
                const filePath = path.join(jobBatchDir, filename);
                
                // Write CSV content
                const csvContent = [header, ...batch.map(row => row.join(','))].join('\n');
                fs.writeFileSync(filePath, csvContent);
                
                // Verify batch constraints
                const propertyCount = {};
                batch.forEach(row => {
                    const propId = row[0];
                    propertyCount[propId] = (propertyCount[propId] || 0) + 1;
                });
                
                const maxBookingsPerProperty = Math.max(...Object.values(propertyCount));
                
                batchFiles.push({
                    filename,
                    bookingCount: batch.length,
                    uniqueProperties: Object.keys(propertyCount).length,
                    maxBookingsPerProperty
                });
                
                console.log(`Batch ${index + 1}: ${filename} - ${batch.length} bookings, ${Object.keys(propertyCount).length} properties`);
            });
            
            const summary = {
                totalBatches: batches.length,
                totalBookings: parsedRows.length,
                uniqueProperties: uniqueProperties.length
            };
            
            resolve({
                jobId,
                summary,
                batches: batchFiles,
                batchDir: jobBatchDir
            });
            
        } catch (error) {
            console.error('CSV Processing error:', error);
            reject(error);
        }
    });
}

function generateBatches(propertyBookings, header) {
    // Create a pool of all bookings
    const allBookings = [];
    for (const [propId, bookings] of Object.entries(propertyBookings)) {
        bookings.forEach(booking => {
            allBookings.push(booking);
        });
    }
    
    const batches = [];
    
    while (allBookings.length > 0) {
        const currentBatch = [];
        const propertyCountInBatch = {};
        const usedIndices = [];
        
        // Build current batch respecting constraints
        for (let i = 0; i < allBookings.length && currentBatch.length < 250; i++) {
            const booking = allBookings[i];
            const propertyId = booking[0];
            
            // Check if we can add this booking (property limit constraint)
            if ((propertyCountInBatch[propertyId] || 0) < 2) {
                currentBatch.push(booking);
                propertyCountInBatch[propertyId] = (propertyCountInBatch[propertyId] || 0) + 1;
                usedIndices.push(i);
            }
        }
        
        // Remove used bookings from the pool (in reverse order to maintain indices)
        usedIndices.reverse().forEach(idx => {
            allBookings.splice(idx, 1);
        });
        
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        } else {
            // Safety check to avoid infinite loop
            break;
        }
    }
    
    return batches;
}

// Routes
app.post('/api/process-csv', upload.single('csvFile'), async (req, res) => {
    try {
        const { batchName } = req.body;
        const csvFile = req.file;
        const jobId = req.jobId;
        
        if (!csvFile) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }
        
        if (!batchName) {
            return res.status(400).json({ error: 'Batch name is required' });
        }
        
        console.log(`Processing job ${jobId}: ${csvFile.originalname}`);
        
        const result = await processCSV(csvFile.path, batchName, jobId);
        
        // Clean up uploaded file
        fs.unlinkSync(csvFile.path);
        
        res.json(result);
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

app.get('/api/download/:jobId', (req, res) => {
    try {
        const { jobId } = req.params;
        const jobBatchDir = path.join(batchesDir, jobId);
        
        if (!fs.existsSync(jobBatchDir)) {
            return res.status(404).json({ error: 'Batches not found' });
        }
        
        const zipPath = path.join(tempDir, `${jobId}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => {
            console.log(`ZIP created: ${archive.pointer()} total bytes`);
            
            // Send the ZIP file
            res.download(zipPath, `batches-${Date.now()}.zip`, (err) => {
                if (!err) {
                    // Clean up ZIP file after download
                    fs.unlink(zipPath, () => {});
                    
                    // Clean up batch directory after download
                    setTimeout(() => {
                        fs.rmSync(jobBatchDir, { recursive: true, force: true });
                    }, 60000); // Clean up after 1 minute
                }
            });
        });
        
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).json({ error: 'Failed to create ZIP file' });
        });
        
        archive.pipe(output);
        
        // Add all batch files to ZIP
        const files = fs.readdirSync(jobBatchDir);
        files.forEach(file => {
            if (file.endsWith('.csv')) {
                archive.file(path.join(jobBatchDir, file), { name: file });
            }
        });
        
        archive.finalize();
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 CSV Batch Processor server running on http://localhost:${PORT}`);
    console.log(`📁 Upload directory: ${uploadsDir}`);
    console.log(`📦 Batches directory: ${batchesDir}`);
});