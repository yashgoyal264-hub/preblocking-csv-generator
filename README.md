# CSV Batch Processor

A web application to process CSV files and generate property-constrained batches for hotel booking data.

## 🌐 **Try it Online!**

**🚀 Live Demo:** https://yashgoyal264-hub.github.io/preblocking-csv-generator/

Use the application directly in your browser - no installation required! The client-side version processes everything locally, so your data never leaves your browser.

## Features

✅ **Upload CSV files** with hotel booking data  
✅ **Custom batch naming** with user-provided names  
✅ **Smart batch generation** with property constraints:
- Maximum 1000 bookings per batch
- Maximum 2 bookings per property per batch
- Mixed properties within each batch

✅ **Batch analysis** showing:
- Total number of batches generated
- Total bookings processed
- Unique properties count
- Individual batch details

✅ **ZIP download** of all generated batch files  
✅ **Responsive web interface** with progress indicators

## Two Ways to Use

### 🌐 **Option 1: Online (Recommended)**
Simply visit: **https://yashgoyal264-hub.github.io/preblocking-csv-generator/**
- No installation needed
- Works directly in your browser
- Your data stays private (processed locally)
- Same features as the local version

### 💻 **Option 2: Local Installation**

1. **Install dependencies:**
```bash
cd csv-batch-processor
npm install
```

2. **Start the server:**
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

3. **Access the application:**
Open your browser and navigate to: `http://localhost:3002`

## Usage

### Step 1: Upload CSV File
1. Enter a batch name (e.g., "Mumbai", "Delhi", etc.)
2. Select your CSV file containing hotel booking data
3. Click "Process CSV & Generate Batches"

### Step 2: Review Results
After processing, you'll see:
- **Summary statistics**: Total batches, bookings, and properties
- **Batch details**: List of all generated batches with booking counts
- **Download option**: ZIP file containing all batch CSV files

### Step 3: Download Batches
Click the "Download All Batches (ZIP)" button to get all generated CSV files in a compressed archive.

## CSV File Format

Your input CSV file should have the following structure:
```csv
property_id,checkin,checkout,rooms,room_type_ids,occupancy,booking_source,payment_mode,booking_status,guest_first_name,guest_last_name,guest_email,guest_phone,rate_plan_codes,custom_price,discount_type,sell_rate,ota_booking_source,ota_booking_id,special_request
910,2025-12-11,2025-12-12,1,1,2,27,Pay @ hotel,1,John,Doe,john@example.com,9876543210,EP,3375,,,99,StayM12345,
...
```

**Required columns:**
- `property_id` (first column): Used for property constraint logic
- `checkin` (second column): Check-in date - **MUST be in YYYY-MM-DD format**
- `checkout` (third column): Check-out date - **MUST be in YYYY-MM-DD format**
- Other columns: Preserved as-is in output batches

**📅 Date Format Requirements:**
- ✅ **Supported**: `YYYY-MM-DD` (e.g., `2025-12-11`)
- ✅ **Auto-converted**: `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY` formats
- ⚠️ **Output guarantee**: All generated batch files will have dates in `YYYY-MM-DD` format
- ❌ **Invalid**: Text dates, incomplete dates, or malformed date strings

## Batch Generation Logic

The application uses an optimized algorithm:

1. **Parse** the uploaded CSV file
2. **Group** bookings by property_id
3. **Generate batches** sequentially:
   - Add up to 2 bookings from each available property
   - Stop when batch reaches 1000 bookings or no more valid bookings
   - Create new batch and repeat
4. **Name files** using format: `{batchName}-{minDay}-{maxDay}-{batchNumber}.csv`

## File Structure

```
csv-batch-processor/
├── public/
│   └── index.html          # Frontend web interface
├── uploads/                # Temporary file uploads
├── batches/               # Generated batch files (auto-cleaned)
├── temp/                  # Temporary ZIP files
├── server.js              # Node.js backend server
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## API Endpoints

- `GET /` - Serve the web interface
- `POST /api/process-csv` - Upload and process CSV file
- `GET /api/download/:jobId` - Download ZIP of batches
- `GET /api/health` - Health check endpoint

## Technical Details

- **Backend**: Node.js with Express
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **File Processing**: CSV parsing and batch generation
- **File Handling**: Multer for uploads, Archiver for ZIP creation
- **Constraints**: 
  - Max 2 bookings per property per batch
  - Max 1000 bookings per batch
  - Files auto-cleaned after download

## Example Output

For a CSV with 2,328 bookings across 103 properties, you might get:
- **Batch 1**: 1000 bookings (500 properties, 2 each from each)
- **Batch 2**: 1000 bookings (remaining properties with additional bookings)
- **Batch 3**: 328 bookings (final remaining bookings)
- **Total**: ~2-3 batch files for this data size (much more efficient!)

## Troubleshooting

**Port already in use?**
- Change the PORT in `server.js` or set environment variable: `PORT=3003 npm start`

**Large file upload fails?**
- Check the file size limit in `server.js` (currently 10MB)

**Processing takes too long?**
- Large CSV files may take time to process; the interface shows a loading indicator

## License

MIT License - Feel free to modify and use as needed.