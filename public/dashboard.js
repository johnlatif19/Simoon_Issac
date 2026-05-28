// public/dashboard.js
const API_URL = window.location.origin;
let allBookings = [];

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return token;
}

// Load bookings
async function loadBookings() {
    const token = checkAuth();
    if (!token) return;

    try {
        const response = await fetch('/api/bookings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'login.html';
            return;
        }

        if (response.ok) {
            allBookings = await response.json();
            displayBookings(allBookings);
            updateStats(allBookings);
        } else {
            console.error('Failed to load bookings');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Display bookings in table
function displayBookings(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    
    if (!tbody) return;

    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا توجد حجوزات حالياً</td></tr>';
        return;
    }

    tbody.innerHTML = bookings.map(booking => `
        <tr>
            <td>${escapeHtml(booking.name)}</td>
            <td>${escapeHtml(booking.email)}</td>
            <td>${escapeHtml(booking.phone)}</td>
            <td>${escapeHtml(booking.tour)}</td>
            <td>${formatDate(booking.date)}</td>
            <td>${escapeHtml(booking.message) || '-'}</td>
            <td>${formatDate(booking.createdAt)}</td>
            <td>
                <button class="delete-btn" onclick="deleteBooking('${booking.id}')">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        </tr>
    `).join('');
}

// Update statistics
function updateStats(bookings) {
    const total = bookings.length;
    const today = new Date().toDateString();
    const todayBookings = bookings.filter(b => new Date(b.createdAt).toDateString() === today).length;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthBookings = bookings.filter(b => {
        const date = new Date(b.createdAt);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    const uniqueClients = new Set(bookings.map(b => b.email)).size;

    document.getElementById('totalBookings').textContent = total;
    document.getElementById('todayBookings').textContent = todayBookings;
    document.getElementById('monthBookings').textContent = monthBookings;
    document.getElementById('totalClients').textContent = uniqueClients;
}

// Delete booking
async function deleteBooking(bookingId) {
    if (!confirm('هل أنت متأكد من حذف هذا الحجز؟')) return;

    const token = checkAuth();
    if (!token) return;

    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'login.html';
            return;
        }

        if (response.ok) {
            loadBookings(); // Refresh the list
        } else {
            alert('حدث خطأ في حذف الحجز');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

// Search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = allBookings.filter(booking => 
                booking.name.toLowerCase().includes(searchTerm) ||
                booking.email.toLowerCase().includes(searchTerm) ||
                booking.tour.toLowerCase().includes(searchTerm)
            );
            displayBookings(filtered);
        });
    }
}

// Helper functions
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG');
}

// Setup logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        window.location.href = 'login.html';
    });
}

// Initialize dashboard
loadBookings();
setupSearch();