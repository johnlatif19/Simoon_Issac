const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Firebase Admin
let db;
try {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig)
    });
    db = admin.firestore();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
    // For development without Firebase, create a mock
    if (process.env.NODE_ENV !== 'production') {
        console.log('Running in development mode without Firebase');
        db = {
            collection: () => ({
                add: async (data) => {
                    console.log('Mock booking saved:', data);
                    return { id: Date.now().toString() };
                },
                get: async () => ({
                    docs: []
                }),
                doc: () => ({
                    delete: async () => {}
                })
            })
        };
    }
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// API Routes

// Login endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign(
            { email: email, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// Verify token endpoint
app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.json({ valid: true });
});

// Get all bookings (protected)
app.get('/api/bookings', authenticateToken, async (req, res) => {
    try {
        if (!db) {
            return res.json([]);
        }
        const bookingsSnapshot = await db.collection('bookings').orderBy('createdAt', 'desc').get();
        const bookings = [];
        bookingsSnapshot.forEach(doc => {
            bookings.push({
                id: doc.id,
                ...doc.data()
            });
        });
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ message: 'Error fetching bookings' });
    }
});

// Create new booking (public)
app.post('/api/bookings', async (req, res) => {
    try {
        const { name, email, phone, tour, date, message, createdAt } = req.body;
        
        // Validation
        if (!name || !email || !phone || !tour || !date) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const booking = {
            name,
            email,
            phone,
            tour,
            date,
            message: message || '',
            createdAt: createdAt || new Date().toISOString(),
            status: 'pending'
        };

        if (db) {
            const docRef = await db.collection('bookings').add(booking);
            res.status(201).json({ id: docRef.id, message: 'Booking created successfully' });
        } else {
            // Mock response for development
            res.status(201).json({ id: Date.now().toString(), message: 'Booking created successfully (mock)' });
        }
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Error creating booking' });
    }
});

// Delete booking (protected)
app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (db) {
            await db.collection('bookings').doc(id).delete();
        }
        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ message: 'Error deleting booking' });
    }
});

// Serve HTML files
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Handle all other routes - serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}`);
});

module.exports = app;