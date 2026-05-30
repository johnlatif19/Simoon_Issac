const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Firebase
let db;
try {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({ credential: admin.credential.cert(firebaseConfig) });
    db = admin.firestore();
    console.log('✅ Firebase connected');
} catch (error) {
    console.error('❌ Firebase error:', error.message);
    process.exit(1);
}

// SMTP
let transporter;
try {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log('✅ SMTP ready');
} catch (error) {
    console.error('❌ SMTP error:', error.message);
}

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ========== LOGIN ==========
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, message: 'تم تسجيل الدخول بنجاح' });
    } else {
        res.status(401).json({ message: 'بيانات غير صحيحة' });
    }
});

app.get('/api/verify-token', authenticateToken, (req, res) => res.json({ valid: true }));

// ========== BOOKINGS API ==========
app.get('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('bookings').orderBy('createdAt', 'desc').get();
        const bookings = [];
        snapshot.forEach(doc => bookings.push({ id: doc.id, ...doc.data() }));
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب الحجوزات' });
    }
});

app.post('/api/bookings', async (req, res) => {
    try {
        const { name, email, phone, tour, nationality, persons, date, message, transferNumber, totalAmount, currency, createdAt } = req.body;
        
        if (!name || !email || !phone || !tour || !date) {
            return res.status(400).json({ message: 'الرجاء ملء جميع الحقول' });
        }
        
        const booking = {
            name, email, phone, tour,
            nationality: nationality || 'foreign',
            persons: persons || 1,
            date,
            message: message || '',
            transferNumber: transferNumber || null,
            totalAmount: totalAmount || null,
            currency: currency || 'USD',
            createdAt: createdAt || new Date().toISOString(),
            status: transferNumber ? 'payment_initiated' : 'pending'
        };
        
        const docRef = await db.collection('bookings').add(booking);
        
        // إرسال إيميل تأكيد للعميل عند الحجز
        try {
            await transporter.sendMail({
                from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
                to: email,
                subject: '📋 تأكيد طلب الحجز - رحلة في مصر',
                html: `
                    <div style="font-family: 'Cairo', sans-serif; direction: rtl; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #2c1810, #8b4513); padding: 20px; text-align: center;">
                            <h1 style="color: #ffd700;">✨ رحلة في مصر</h1>
                        </div>
                        <div style="background: #fff; padding: 20px;">
                            <h2 style="color: #2c1810;">مرحباً ${name}،</h2>
                            <p>تم استلام طلب حجزك بنجاح! هذه بيانات حجزك:</p>
                            <div style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 15px 0;">
                                <p><strong>📅 الجولة:</strong> ${tour}</p>
                                <p><strong>👥 عدد الأفراد:</strong> ${persons}</p>
                                <p><strong>📆 تاريخ الحجز:</strong> ${date}</p>
                                <p><strong>💰 المبلغ:</strong> ${totalAmount || (tour === 'جولة المتحف المصري الكبير' ? 50 : 75) * persons} ${currency === 'EGP' ? 'جنيه' : 'دولار'}</p>
                            </div>
                            <p>سيتم التواصل معك قريباً لتأكيد الحجز.</p>
                            <p>شكراً لاختياركم رحلة في مصر!</p>
                        </div>
                    </div>
                `
            });
            console.log('📧 Booking confirmation email sent to customer');
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
        }
        
        // إرسال إشعار للمدير
        try {
            await transporter.sendMail({
                from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
                to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
                subject: '🔔 حجز جديد - رحلة في مصر',
                html: `
                    <div style="font-family: 'Cairo', sans-serif; direction: rtl;">
                        <h2>حجز جديد!</h2>
                        <p><strong>الاسم:</strong> ${name}</p>
                        <p><strong>البريد:</strong> ${email}</p>
                        <p><strong>الهاتف:</strong> ${phone}</p>
                        <p><strong>الجولة:</strong> ${tour}</p>
                        <p><strong>عدد الأفراد:</strong> ${persons}</p>
                        <p><strong>التاريخ:</strong> ${date}</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Failed to send admin notification:', emailError);
        }
        
        res.status(201).json({ id: docRef.id, message: 'تم إنشاء الحجز' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'خطأ في إنشاء الحجز' });
    }
});

// إضافة API لتأكيد الدفع
app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { bookingId, email, name, tour, persons, date, totalAmount, currency, transferNumber } = req.body;
        
        // تحديث حالة الحجز
        if (bookingId) {
            await db.collection('bookings').doc(bookingId).update({ 
                paymentStatus: 'completed',
                status: 'confirmed'
            });
        }
        
        // إرسال إيميل تأكيد الدفع للعميل
        await transporter.sendMail({
            from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
            to: email,
            subject: '✅ تأكيد الدفع - رحلة في مصر',
            html: `
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #2c1810, #8b4513); padding: 20px; text-align: center;">
                        <h1 style="color: #ffd700;">✅ تم تأكيد الدفع</h1>
                    </div>
                    <div style="background: #fff; padding: 20px;">
                        <h2 style="color: #2c1810;">عزيزي/عزيزتي ${name}،</h2>
                        <p>نؤكد لك استلام مبلغ الحجز الخاص بك.</p>
                        <div style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 15px 0;">
                            <p><strong>📅 الجولة:</strong> ${tour}</p>
                            <p><strong>👥 عدد الأفراد:</strong> ${persons}</p>
                            <p><strong>📆 تاريخ الحجز:</strong> ${date}</p>
                            <p><strong>💰 المبلغ المدفوع:</strong> ${totalAmount} ${currency === 'EGP' ? 'جنيه' : 'دولار'}</p>
                            <p><strong>🔢 الرقم المرجعي:</strong> ${transferNumber}</p>
                        </div>
                        <p>تم تأكيد حجزك بنجاح! في انتظارك في رحلة لا تُنسى.</p>
                        <p>شكراً لثقتكم في رحلة في مصر.</p>
                        <hr>
                        <p style="font-size: 12px; color: #666;">هذا إيميل آلي، يرجى عدم الرد عليه.</p>
                    </div>
                </div>
            `
        });
        
        // إشعار للمدير
        await transporter.sendMail({
            from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
            subject: '💰 تأكيد دفع - رحلة في مصر',
            html: `<h2>تم تأكيد دفع الحجز</h2><p>العميل: ${name}</p><p>المبلغ: ${totalAmount} ${currency === 'EGP' ? 'جنيه' : 'دولار'}</p>`
        });
        
        res.json({ message: 'تم تأكيد الدفع وإرسال الإيميلات' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'خطأ في تأكيد الدفع' });
    }
});

app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('bookings').doc(req.params.id).delete();
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الحذف' });
    }
});

// ========== RANKINGS API ==========
app.get('/api/rankings', async (req, res) => {
    try {
        const snapshot = await db.collection('rankings').orderBy('createdAt', 'desc').get();
        const rankings = [];
        snapshot.forEach(doc => rankings.push({ id: doc.id, ...doc.data() }));
        res.json(rankings);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب التقييمات' });
    }
});

app.post('/api/rankings', async (req, res) => {
    try {
        const { name, country, rating, message } = req.body;
        if (!name || !country || !rating || !message) return res.status(400).json({ message: 'املأ جميع الحقول' });
        if (rating < 1 || rating > 5) return res.status(400).json({ message: 'التقييم بين 1 و5' });
        const ranking = {
            name: name.trim(), country: country.trim(), rating: parseInt(rating),
            message: message.trim(), createdAt: new Date().toISOString(), status: 'approved'
        };
        const docRef = await db.collection('rankings').add(ranking);
        res.status(201).json({ id: docRef.id, message: 'تم إضافة التقييم' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في إضافة التقييم' });
    }
});

app.delete('/api/rankings/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('rankings').doc(req.params.id).delete();
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الحذف' });
    }
});

// ========== CONTACTS API ==========
app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, message, createdAt } = req.body;
        if (!name || !email || !message) return res.status(400).json({ message: 'املأ جميع الحقول' });
        const contact = { name, email, message, createdAt: createdAt || new Date().toISOString(), status: 'unread' };
        const docRef = await db.collection('contacts').add(contact);
        
        // إرسال إشعار للمدير
        await transporter.sendMail({
            from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
            subject: '📩 رسالة جديدة من الموقع',
            html: `<h2>رسالة جديدة</h2><p><strong>من:</strong> ${name}</p><p><strong>البريد:</strong> ${email}</p><p><strong>الرسالة:</strong> ${message}</p>`
        });
        
        res.status(201).json({ id: docRef.id, message: 'تم إرسال الرسالة' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الإرسال' });
    }
});

// ========== SEND EMAIL ==========
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        if (!to || !subject || !message) return res.status(400).json({ message: 'املأ جميع الحقول' });
        if (!transporter) return res.status(500).json({ message: 'SMTP غير مهيأ' });
        await transporter.sendMail({
            from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: `<div style="font-family:Cairo;direction:rtl"><h2 style="color:#ffd700">✨ رحلة في مصر</h2><div style="padding:20px;background:#f5f5f5">${message.replace(/\n/g,'<br>')}</div><small>مرسل من لوحة التحكم</small></div>`
        });
        res.json({ message: 'تم الإرسال بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الإرسال: ' + error.message });
    }
});

// ==================== CONTACTS API ====================
app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, message, createdAt } = req.body;
        
        if (!name || !email || !message) {
            return res.status(400).json({ message: 'الرجاء ملء جميع الحقول' });
        }

        const contact = {
            name: name.trim(),
            email: email.trim(),
            message: message.trim(),
            createdAt: createdAt || new Date().toISOString(),
            status: 'unread'
        };

        const docRef = await db.collection('contacts').add(contact);
        
        // إرسال إشعار للمدير عبر البريد
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: `"رحلة في مصر" <${process.env.SMTP_USER}>`,
                    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
                    subject: '📩 رسالة جديدة من الموقع',
                    html: `
                        <div style="font-family: 'Cairo', sans-serif; direction: rtl;">
                            <h2 style="color: #ffd700;">📩 رسالة جديدة</h2>
                            <p><strong>الاسم:</strong> ${name}</p>
                            <p><strong>البريد/الهاتف:</strong> ${email}</p>
                            <p><strong>الرسالة:</strong> ${message}</p>
                            <hr>
                            <small>تم استلام الرسالة من نموذج التواصل في الموقع</small>
                        </div>
                    `
                });
                console.log('📧 Admin notified about new contact message');
            } catch(emailError) {
                console.error('Failed to send email notification:', emailError);
            }
        }
        
        res.status(201).json({ id: docRef.id, message: 'تم إرسال رسالتك بنجاح' });
    } catch (error) {
        console.error('Error creating contact:', error);
        res.status(500).json({ message: 'حدث خطأ في إرسال الرسالة' });
    }
});

app.get('/api/contacts', authenticateToken, async (req, res) => {
    try {
        const contactsSnapshot = await db.collection('contacts').orderBy('createdAt', 'desc').get();
        const contacts = [];
        contactsSnapshot.forEach(doc => {
            contacts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        res.json(contacts);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'حدث خطأ في جلب الرسائل' });
    }
});

app.delete('/api/contacts/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('contacts').doc(id).delete();
        res.json({ message: 'تم حذف الرسالة بنجاح' });
    } catch (error) {
        console.error('Error deleting contact:', error);
        res.status(500).json({ message: 'حدث خطأ في حذف الرسالة' });
    }
});

app.put('/api/contacts/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('contacts').doc(id).update({ status: 'read' });
        res.json({ message: 'تم تحديث حالة الرسالة' });
    } catch (error) {
        console.error('Error updating contact:', error);
        res.status(500).json({ message: 'حدث خطأ في تحديث الرسالة' });
    }
});

// ========== SERVE HTML ==========
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/rate', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rate.html')));
app.get('/pay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pay.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`✅ Firebase: Connected`);
    console.log(`✅ SMTP: ${transporter ? 'Ready' : 'Not configured'}\n`);
});

module.exports = app;