const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const CryptoJS = require('crypto-js');
const sqlite3 = require('sqlite3').verbose();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Check data directory permissions
try {
  fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
  console.log(`Data directory ${dataDir} has read/write permissions`);
} catch (err) {
  console.error(`Data directory permission error: ${err.message}`);
  console.error(`This might prevent the database from saving accounts!`);
}

// Setup database with persistence
const dbPath = path.join(dataDir, 'accounts.db');
console.log(`Setting up SQLite database at ${dbPath}`);

// Check if database file exists and is accessible
try {
  if (fs.existsSync(dbPath)) {
    console.log(`Database file exists at ${dbPath}`);
    // Check file permissions
    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
      console.log(`Database file has read/write permissions`);
    } catch (err) {
      console.error(`Database file permission error: ${err.message}`);
    }
  } else {
    console.log(`Database file does not exist yet, will be created`);
  }
} catch (err) {
  console.error(`Error checking database file: ${err.message}`);
}

// Initialize SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Error opening database: ${err.message}`);
    process.exit(1);
  }
  console.log('Connected to the SQLite database.');
  
  // Create accounts table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    issuer TEXT,
    secret TEXT NOT NULL,
    type TEXT DEFAULT 'totp',
    digits INTEGER DEFAULT 6,
    algorithm TEXT DEFAULT 'SHA1',
    period INTEGER DEFAULT 30,
    createdAt INTEGER
  )`, (err) => {
    if (err) {
      console.error(`Error creating table: ${err.message}`);
    } else {
      console.log('Accounts table ready');
    }
  });
});

// Enable foreign keys and set pragmas for better performance
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');

// Promisify database methods for easier async usage
const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

// Encryption key (in production, store this securely!)
// For development purposes only, change in production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secure-encryption-key';

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to generate TOTP code using oathtool
function generateTOTP(secret) {
  return new Promise((resolve, reject) => {
    // Clean the secret (remove spaces and convert to uppercase)
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    
    console.log(`Generating TOTP for secret: ${cleanSecret.substring(0, 3)}... (length: ${cleanSecret.length})`);
    
    // Using simpler command format
    const command = `oathtool --totp -b "${cleanSecret}"`;
    console.log(`Running command: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`oathtool error:`, error);
        // Try alternative command format as fallback
        const fallbackCommand = `oathtool --totp "${cleanSecret}"`;
        console.log(`Trying fallback command: ${fallbackCommand}`);
        
        exec(fallbackCommand, (fbError, fbStdout, fbStderr) => {
          if (fbError) {
            console.error(`Fallback command error:`, fbError);
            return reject(fbError);
          }
          if (fbStderr) {
            console.error(`Fallback command stderr: ${fbStderr}`);
            return reject(new Error(fbStderr));
          }
          const token = fbStdout.trim();
          console.log(`Generated token from fallback: ${token}`);
          resolve(token);
        });
        return;
      }
      if (stderr) {
        console.error(`oathtool stderr: ${stderr}`);
        return reject(new Error(stderr));
      }
      
      // Return the TOTP code (trimming any whitespace)
      const token = stdout.trim();
      console.log(`Generated token: ${token}`);
      resolve(token);
    });
  });
}

// Helper function to calculate seconds remaining until next TOTP cycle
function calculateRemainingSeconds() {
  const now = Math.floor(Date.now() / 1000);
  return 30 - (now % 30);
}

// Parse otpauth URI
function parseOTPAuthURI(uri) {
  if (!uri.startsWith('otpauth://totp/')) {
    throw new Error('Invalid OTP URI format');
  }
  
  try {
    const pathStartIndex = 'otpauth://totp/'.length;
    const queryStartIndex = uri.indexOf('?', pathStartIndex);
    
    // Extract path (which contains the label/name)
    const encodedPath = uri.substring(pathStartIndex, queryStartIndex !== -1 ? queryStartIndex : undefined);
    const label = decodeURIComponent(encodedPath);
    console.log("Raw encoded path:", encodedPath);
    console.log("Manually decoded label:", label);
    
    // Parse the query parameters
    const queryPart = queryStartIndex !== -1 ? uri.substring(queryStartIndex + 1) : '';
    const params = new URLSearchParams(queryPart);
    
    const secret = params.get('secret');
    if (!secret) {
      throw new Error('URI missing secret parameter');
    }
    
    // Extract issuer and name from label (usually in format Issuer:Name)
    let issuer = params.get('issuer') || '';
    let name = label;
    
    if (label.includes(':')) {
      const parts = label.split(':');
      if (!issuer) issuer = parts[0].trim();
      name = parts[1].trim();
    }
    
    console.log("Parsed issuer:", issuer);
    console.log("Parsed label:", label);
    
    return {
      type: 'totp',
      secret: secret,
      name: name,
      issuer: issuer,
      digits: parseInt(params.get('digits') || '6'),
      algorithm: params.get('algorithm') || 'SHA1',
      period: parseInt(params.get('period') || '30')
    };
  } catch (error) {
    console.error("URI parsing error:", error);
    throw new Error('Failed to parse OTP URI: ' + error.message);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to get all accounts (names only)
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await dbAll(`SELECT id, name, issuer FROM accounts`);
    res.json(accounts);
  } catch (err) {
    console.error('Failed to fetch accounts:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// API to get current TOTP code for an account
app.get('/api/accounts/:id/code', async (req, res) => {
  const accountId = req.params.id;
  console.log(`Code request for account ID: ${accountId}`);
  
  try {
    const account = await dbGet(`SELECT * FROM accounts WHERE id = ?`, [accountId]);
    
    if (!account) {
      console.error(`Account not found: ${accountId}`);
      return res.status(404).json({ error: 'Account not found' });
    }

    try {
      // Decrypt the secret
      const bytes = CryptoJS.AES.decrypt(account.secret, ENCRYPTION_KEY);
      const secret = bytes.toString(CryptoJS.enc.Utf8);
      
      console.log(`Generating token for account ${account.id} with secret length ${secret.length}`);
      console.log(`First few chars of decrypted secret: ${secret.substring(0, 3)}...`);
      
      // Generate TOTP using oathtool
      try {
        const token = await generateTOTP(secret);
        const timeRemaining = calculateRemainingSeconds();
        
        console.log(`Token generated: ${token}, Time remaining: ${timeRemaining}s`);
        
        res.json({ 
          token, 
          timeRemaining,
          name: account.name,
          issuer: account.issuer
        });
      } catch (genError) {
        console.error(`Error generating token for account ${account.id}:`, genError);
        res.status(500).json({ 
          error: 'Failed to generate token',
          token: 'ERROR',
          timeRemaining: 30,
          name: account.name,
          issuer: account.issuer
        });
      }
    } catch (error) {
      console.error(`Error processing token for account ${account.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to generate token',
        token: 'ERROR',
        timeRemaining: 30
      });
    }
  } catch (err) {
    console.error(`Database error for account ${accountId}:`, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API to add account via URI
app.post('/api/accounts/uri', async (req, res) => {
  const { uri } = req.body;
  
  if (!uri) {
    return res.status(400).json({ error: 'URI is required' });
  }

  try {
    // Debug log the URI
    console.log("Parsing URI (first 20 chars):", uri.substring(0, 20) + "...");
    
    // Try to parse the otpauth URI
    const parsed = parseOTPAuthURI(uri);
    console.log("Successfully parsed URI:", {
      name: parsed.name,
      issuer: parsed.issuer
    });
    
    // Test generating a token first to validate the secret
    try {
      const token = await generateTOTP(parsed.secret);
      console.log("Test token generation successful:", token);
    } catch (testError) {
      console.error("Test token generation failed:", testError);
      return res.status(400).json({ error: 'Invalid secret key. Unable to generate token.' });
    }
    
    // Encrypt the secret before storing
    const encryptedSecret = CryptoJS.AES.encrypt(parsed.secret, ENCRYPTION_KEY).toString();
    
    const timestamp = Date.now();
    
    console.log("Creating account:", {
      name: parsed.name,
      issuer: parsed.issuer || 'Unknown',
      type: 'totp',
      algorithm: parsed.algorithm || 'SHA1'
    });

    try {
      // Insert the new account into the database
      const result = await dbRun(
        `INSERT INTO accounts (name, issuer, secret, type, digits, algorithm, period, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsed.name, 
          parsed.issuer || 'Unknown', 
          encryptedSecret,
          'totp',
          parsed.digits || 6,
          parsed.algorithm || 'SHA1',
          parsed.period || 30,
          timestamp
        ]
      );
      
      const newId = result.lastID;
      console.log(`New account created with ID: ${newId}`);
      
      // Verify the account was created
      const newAccount = await dbGet(`SELECT id, name, issuer FROM accounts WHERE id = ?`, [newId]);
      
      if (!newAccount) {
        console.error(`Warning: Could not immediately find newly created account ${newId}`);
        console.error(`This suggests a database persistence issue`);
      } else {
        console.log(`Successfully verified new account ${newId} exists in database`);
      }
      
      res.status(201).json({ 
        id: newId,
        name: parsed.name,
        issuer: parsed.issuer || 'Unknown'
      });
    } catch (dbError) {
      console.error("Database error during account creation:", dbError);
      res.status(500).json({ error: 'Failed to save account' });
    }
  } catch (error) {
    console.error("URI processing error:", error);
    res.status(400).json({ error: 'Invalid OTP URI: ' + error.message });
  }
});

// API to add account with manual entry of key components
app.post('/api/accounts/manual', async (req, res) => {
  const { name, issuer, secret } = req.body;
  
  if (!name || !secret) {
    return res.status(400).json({ error: 'Name and secret are required' });
  }

  try {
    // Test token generation to validate the secret
    try {
      const token = await generateTOTP(secret);
      console.log("Test token generation successful:", token);
    } catch (testError) {
      console.error("Test token generation failed:", testError);
      return res.status(400).json({ error: 'Invalid secret key. Unable to generate token.' });
    }
    
    // Encrypt the secret before storing
    const encryptedSecret = CryptoJS.AES.encrypt(secret, ENCRYPTION_KEY).toString();
    const timestamp = Date.now();
    
    try {
      // Insert the new account into the database
      const result = await dbRun(
        `INSERT INTO accounts (name, issuer, secret, type, digits, algorithm, period, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, 
          issuer || 'Unknown', 
          encryptedSecret,
          'totp',
          6,
          'SHA1',
          30,
          timestamp
        ]
      );
      
      const newId = result.lastID;
      console.log(`New account created with ID: ${newId}`);
      
      // Verify the account was created
      const newAccount = await dbGet(`SELECT id, name, issuer FROM accounts WHERE id = ?`, [newId]);
      
      if (!newAccount) {
        console.error(`Warning: Could not immediately find newly created account ${newId}`);
        console.error(`This suggests a database persistence issue`);
      } else {
        console.log(`Successfully verified new account ${newId} exists in database`);
      }
      
      res.status(201).json({ 
        id: newId,
        name: name,
        issuer: issuer || 'Unknown'
      });
    } catch (dbError) {
      console.error("Database error during account creation:", dbError);
      res.status(500).json({ error: 'Failed to save account' });
    }
  } catch (error) {
    console.error("Manual account creation error:", error);
    res.status(400).json({ error: 'Error creating account: ' + error.message });
  }
});

// API to delete an account
app.delete('/api/accounts/:id', async (req, res) => {
  const accountId = req.params.id;
  console.log(`Delete request for account ID: ${accountId}`);
  
  try {
    const result = await dbRun(`DELETE FROM accounts WHERE id = ?`, [accountId]);
    
    console.log(`Removed ${result.changes} account(s) with ID ${accountId}`);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(`Error removing account ${accountId}:`, err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

// API to delete all accounts
app.delete('/api/accounts-deleteall', async (req, res) => {
  console.log('Request to delete ALL accounts received');
  
  try {
    const result = await dbRun(`DELETE FROM accounts`);
    
    console.log(`Removed ${result.changes} account(s) from database`);
    
    res.json({ 
      success: true,
      deletedCount: result.changes
    });
  } catch (err) {
    console.error('Error removing all accounts:', err);
    res.status(500).json({ error: 'Failed to remove all accounts' });
  }
});

// API to get debug information
app.get('/api/debug', async (req, res) => {
  console.log('Debug information requested');
  
  try {
    // System information
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: port
      }
    };
    
    // Database information
    let dbInfo = {};
    try {
      const dbStats = await dbAll(`PRAGMA database_list`);
      const tableInfo = await dbAll(`SELECT name FROM sqlite_master WHERE type='table'`);
      const accountsCount = await dbGet(`SELECT COUNT(*) as count FROM accounts`);
      const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
      const walSize = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0;
      const shmSize = fs.existsSync(`${dbPath}-shm`) ? fs.statSync(`${dbPath}-shm`).size : 0;
      
      dbInfo = {
        path: dbPath,
        exists: fs.existsSync(dbPath),
        size: {
          main: `${(dbSize / 1024).toFixed(2)} KB`,
          wal: `${(walSize / 1024).toFixed(2)} KB`,
          shm: `${(shmSize / 1024).toFixed(2)} KB`,
          total: `${((dbSize + walSize + shmSize) / 1024).toFixed(2)} KB`
        },
        tables: tableInfo.map(t => t.name),
        accountsCount: accountsCount.count,
        connection: dbStats
      };
    } catch (dbErr) {
      dbInfo = { error: dbErr.message };
    }
    
    // Accounts summary (without secrets)
    let accountsSummary = [];
    try {
      const accounts = await dbAll(`SELECT id, name, issuer, type, digits, algorithm, period, createdAt FROM accounts`);
      accountsSummary = accounts.map(account => ({
        ...account,
        createdAt: new Date(account.createdAt).toISOString(),
        secretLength: 'REDACTED'
      }));
    } catch (accErr) {
      accountsSummary = { error: accErr.message };
    }
    
    // File system information
    let fsInfo = {};
    try {
      const dataDirContents = fs.readdirSync(dataDir);
      const dirStats = fs.statSync(dataDir);
      
      fsInfo = {
        dataDir,
        readable: true,
        writable: true,
        files: dataDirContents,
        dirStats: {
          size: `${(dirStats.size / 1024).toFixed(2)} KB`,
          created: dirStats.birthtime,
          modified: dirStats.mtime,
          permissions: dirStats.mode.toString(8).slice(-3)
        }
      };
    } catch (fsErr) {
      fsInfo = { 
        dataDir,
        error: fsErr.message,
        readable: false,
        writable: false
      };
      
      // Try to determine read/write access separately
      try {
        fs.accessSync(dataDir, fs.constants.R_OK);
        fsInfo.readable = true;
      } catch (e) {}
      
      try {
        fs.accessSync(dataDir, fs.constants.W_OK);
        fsInfo.writable = true;
      } catch (e) {}
    }
    
    // ENCRYPTION_KEY status (only report if it's set or not, never the actual value)
    const encryptionKeyInfo = {
      source: process.env.ENCRYPTION_KEY ? 'environment' : 'default',
      isDefault: !process.env.ENCRYPTION_KEY,
      // Never expose the actual key
      warning: process.env.ENCRYPTION_KEY ? null : 'Using default encryption key is not recommended for production'
    };
    
    // Return all debug information
    res.json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      database: dbInfo,
      accounts: accountsSummary,
      filesystem: fsInfo,
      encryption: encryptionKeyInfo
    });
  } catch (error) {
    console.error('Error generating debug information:', error);
    res.status(500).json({ 
      error: 'Failed to generate debug information',
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Authenticator app listening at http://localhost:${port}`);
  console.log(`Also accessible on your local network at http://<your-IP-address>:${port}`);
});