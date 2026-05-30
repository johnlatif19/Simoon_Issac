const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Firebase Admin
let db;
try {
  if (process.env.FIREBASE_CONFIG) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('✅ Firebase connected successfully');
  } else {
    console.warn('⚠️ No FIREBASE_CONFIG found, using memory storage');
    db = null;
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  db = null;
}

// In-memory storage fallback
const memoryStorage = {
  tours: [],
  packages: [],
  bookings: [],
  contacts: []
};

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Middleware: Verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============= AUTH ENDPOINTS =============
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

app.post('/api/verify-token', verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============= TOURS ENDPOINTS =============
app.get('/api/tours', async (req, res) => {
  try {
    if (db) {
      const snapshot = await db.collection('tours').get();
      const tours = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(tours);
    } else {
      res.json(memoryStorage.tours);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tours', verifyToken, async (req, res) => {
  try {
    const tour = req.body;
    if (db) {
      const docRef = await db.collection('tours').add(tour);
      res.json({ id: docRef.id, ...tour });
    } else {
      const newTour = { id: Date.now().toString(), ...tour };
      memoryStorage.tours.push(newTour);
      res.json(newTour);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tours/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await db.collection('tours').doc(id).delete();
      res.json({ success: true });
    } else {
      memoryStorage.tours = memoryStorage.tours.filter(t => t.id !== id);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= BOOKINGS ENDPOINTS (FIXED - now saves tourName) =============
app.post('/api/bookings', async (req, res) => {
  try {
    const { tourId, name, email, phone, persons, date } = req.body;
    
    // Get tour name from tours collection
    let tourName = 'رحلة سياحية';
    
    if (db) {
      // Try to get tour from Firestore
      const tourDoc = await db.collection('tours').doc(tourId).get();
      if (tourDoc.exists) {
        const tourData = tourDoc.data();
        tourName = tourData.titleAr || tourData.titleEn || 'رحلة سياحية';
      }
    } else {
      // Get from memory storage
      const tour = memoryStorage.tours.find(t => t.id === tourId);
      if (tour) {
        tourName = tour.titleAr || tour.titleEn || 'رحلة سياحية';
      }
    }
    
    const booking = { 
      tourId,
      tourName,
      name, 
      email, 
      phone, 
      persons, 
      date,
      createdAt: new Date().toISOString() 
    };
    
    if (db) {
      const docRef = await db.collection('bookings').add(booking);
      booking.id = docRef.id;
    } else {
      booking.id = Date.now().toString();
      memoryStorage.bookings.push(booking);
    }
    
    // Send beautiful email notification
    try {
      const emailHtml = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>تأكيد الحجز - جولات استكشافية في مصر | Discovery Tours Egypt</title>
          <style>
            body { font-family: 'Cairo', Tahoma, Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; direction: rtl; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0B3B5A 0%, #1a5a7a 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .greeting { font-size: 18px; font-weight: bold; color: #0B3B5A; margin-bottom: 20px; }
            .tour-details { background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-right: 4px solid #F4A261; }
            .tour-details h3 { color: #0B3B5A; margin-top: 0; margin-bottom: 15px; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
            .detail-label { font-weight: bold; color: #666; }
            .detail-value { color: #333; }
            .message { background-color: #FFF8E7; border-radius: 12px; padding: 15px; margin: 20px 0; text-align: center; color: #856404; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🇪🇬جولات استكشافية في مصر | Discovery Tours Egypt</h1><p>استكشف مصر</p></div>
            <div class="content">
              <div class="greeting">السادة العملاء الكرام،</div>
              <p>يسعدنا تأكيد حجزكم معنا، ونشكركم لثقتكم بنا. فيما يلي تفاصيل حجزكم:</p>
              <div class="tour-details">
                <h3>📋 تفاصيل الرحلة</h3>
                <div class="detail-row"><span class="detail-label">🏝️ اسم الرحلة:</span><span class="detail-value">${tourName}</span></div>
                <div class="detail-row"><span class="detail-label">👤 الاسم:</span><span class="detail-value">${name || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">📧 البريد الإلكتروني:</span><span class="detail-value">${email || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">📞 رقم الهاتف:</span><span class="detail-value">${phone || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">👥 عدد الأشخاص:</span><span class="detail-value">${persons || '1'} شخص</span></div>
                <div class="detail-row"><span class="detail-label">📅 تاريخ الرحلة:</span><span class="detail-value">${date || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">🕐 تاريخ الحجز:</span><span class="detail-value">${new Date(booking.createdAt).toLocaleDateString('ar-EG')}</span></div>
              </div>
              <div class="message"><strong>📢 ملاحظة مهمة:</strong><br>سيتم التواصل معكم خلال 24 ساعة لتأكيد الحجز نهائياً.</div>
              <p style="text-align: center;"><strong>مع تحيات فريق جولات استكشافية في مصر</strong></p>
            </div>
            <div class="footer"><p>© 2026 جولات استكشافية في مصر | Discovery Tours Egypt - جميع الحقوق محفوظة</p></div>
          </div>
        </body>
        </html>
      `;
      
      await transporter.sendMail({
        from: `"جولات استكشافية في مصر" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🎉 تأكيد حجز رحلتك - جولات استكشافية في مصر',
        html: emailHtml
      });
      
      console.log(`📧 Booking email sent to ${email}`);
    } catch (emailError) {
      console.log('Email error:', emailError.message);
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings', verifyToken, async (req, res) => {
  try {
    if (db) {
      const snapshot = await db.collection('bookings').orderBy('createdAt', 'desc').get();
      const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(bookings);
    } else {
      res.json(memoryStorage.bookings);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      const doc = await db.collection('bookings').doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Booking not found' });
      res.json({ id: doc.id, ...doc.data() });
    } else {
      const booking = memoryStorage.bookings.find(b => b.id === id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json(booking);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/bookings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (db) {
      await db.collection('bookings').doc(id).update(updates);
      res.json({ success: true, id, ...updates });
    } else {
      const index = memoryStorage.bookings.findIndex(b => b.id === id);
      if (index === -1) return res.status(404).json({ error: 'Booking not found' });
      memoryStorage.bookings[index] = { ...memoryStorage.bookings[index], ...updates };
      res.json({ success: true, id, ...updates });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bookings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await db.collection('bookings').doc(id).delete();
      res.json({ success: true });
    } else {
      memoryStorage.bookings = memoryStorage.bookings.filter(b => b.id !== id);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= CONTACT ENDPOINTS =============
app.post('/api/contact', async (req, res) => {
  try {
    const contact = { ...req.body, createdAt: new Date().toISOString() };
    
    if (db) {
      await db.collection('contacts').add(contact);
    } else {
      if (!memoryStorage.contacts) memoryStorage.contacts = [];
      contact.id = Date.now().toString();
      memoryStorage.contacts.push(contact);
    }
    
    // Send confirmation email to the user
    try {
      await transporter.sendMail({
        from: `"جولات استكشافية في مصر" <${process.env.SMTP_USER}>`,
        to: contact.email,
        subject: `📧 شكراً لتواصلك مع جولات استكشافية في مصر - ${contact.subject || 'رسالتك'}`,
        html: `
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head><meta charset="UTF-8"><title>شكراً لتواصلك</title>
          <style>
            body { font-family: 'Cairo', Tahoma, Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; direction: rtl; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0B3B5A 0%, #1a5a7a 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .greeting { font-size: 18px; font-weight: bold; color: #0B3B5A; margin-bottom: 20px; }
            .message-box { background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-right: 4px solid #F4A261; line-height: 1.8; white-space: pre-wrap; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; }
          </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><h1>🇪🇬 جولات استكشافية في مصر</h1><p>رحلات سياحية لا تُنسى</p></div>
              <div class="content">
                <div class="greeting">عزيزي/عزيزتي ${contact.name}،</div>
                <p>شكراً لتواصلك مع فريق جولات استكشافية في مصر. هذا تأكيد باستلام رسالتك، وسنقوم بالرد عليك في أقرب وقت ممكن.</p>
                <p><strong>ملخص رسالتك:</strong></p>
                <div class="message-box">
                  <strong>الموضوع:</strong> ${contact.subject || 'بدون موضوع'}<br><br>
                  ${contact.message.replace(/\n/g, '<br>')}
                </div>
                <p style="text-align: center;"><strong>مع تحيات فريق جولات استكشافية في مصر</strong></p>
              </div>
              <div class="footer"><p>© 2026 جولات استكشافية في مصر - جميع الحقوق محفوظة</p></div>
            </div>
          </body>
          </html>
        `
      });
      console.log(`📧 Confirmation email sent to ${contact.email}`);
    } catch (emailError) {
      console.log('Email error (user confirmation):', emailError.message);
    }
    
    // Send email notification to admin
    try {
      await transporter.sendMail({
        from: `"موقع جولات استكشافية في مصر" <${process.env.SMTP_USER}>`,
        to: process.env.SMTP_USER,
        subject: `📧 رسالة جديدة من ${contact.name}`,
        html: `
          <h3>رسالة جديدة من موقع جولات استكشافية في مصر</h3>
          <p><strong>الاسم:</strong> ${contact.name}</p>
          <p><strong>البريد:</strong> ${contact.email}</p>
          <p><strong>الهاتف:</strong> ${contact.phone || 'غير مدخل'}</p>
          <p><strong>الموضوع:</strong> ${contact.subject || 'بدون موضوع'}</p>
          <p><strong>الرسالة:</strong></p>
          <p>${contact.message}</p>
        `
      });
    } catch (emailError) {
      console.log('Email error (admin):', emailError.message);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contacts', verifyToken, async (req, res) => {
  try {
    if (db) {
      const snapshot = await db.collection('contacts').orderBy('createdAt', 'desc').get();
      const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(contacts);
    } else {
      res.json(memoryStorage.contacts || []);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contacts/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      const doc = await db.collection('contacts').doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Not found' });
      res.json({ id: doc.id, ...doc.data() });
    } else {
      const contact = memoryStorage.contacts?.find(c => c.id === id);
      if (!contact) return res.status(404).json({ error: 'Not found' });
      res.json(contact);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/contacts/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await db.collection('contacts').doc(id).delete();
      res.json({ success: true });
    } else {
      if (!memoryStorage.contacts) memoryStorage.contacts = [];
      memoryStorage.contacts = memoryStorage.contacts.filter(c => c.id !== id);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= ADMIN SEND EMAIL ENDPOINT =============
app.post('/api/admin/send-email', verifyToken, async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    
    if (!email || !subject || !message) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }
    
    const emailHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head><meta charset="UTF-8"><title>${subject}</title>
      <style>
        body { font-family: 'Cairo', Tahoma, Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; direction: rtl; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0B3B5A 0%, #1a5a7a 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .message-box { background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-right: 4px solid #F4A261; line-height: 1.8; white-space: pre-wrap; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; }
      </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🇪🇬 جولات استكشافية في مصر</h1><p>استكشف مصر</p></div>
          <div class="content">
            <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
            <p style="text-align: center;"><strong>مع تحيات فريق جولات استكشافية في مصر</strong></p>
          </div>
          <div class="footer"><p>© 2026 جولات استكشافية في مصر - جميع الحقوق محفوظة</p></div>
        </div>
      </body>
      </html>
    `;
    
    await transporter.sendMail({
      from: `"جولات استكشافية في مصر" <${process.env.SMTP_USER}>`,
      to: email,
      subject: subject,
      html: emailHtml
    });
    
    console.log(`📧 Admin email sent to: ${email} - Subject: ${subject}`);
    res.json({ success: true, message: 'تم إرسال البريد بنجاح' });
    
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'فشل إرسال البريد: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Main site: http://localhost:${PORT}/`);
  console.log(`🔐 Login: http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`✨ Database starts EMPTY - No demo data`);
});