// public/app.js
const API_URL = window.location.origin;

// Mobile menu toggle
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
    });
}

// Smooth scroll
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// Booking modal
const modal = document.getElementById('bookingModal');
const closeBtn = document.querySelector('.close');

function openBookingModal(tourName) {
    if (modal) {
        document.getElementById('modalTour').value = tourName;
        modal.style.display = 'block';
    }
}

if (closeBtn) {
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    }
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Handle main booking form
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const bookingData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            tour: document.getElementById('tour').value,
            date: document.getElementById('date').value,
            message: document.getElementById('message').value,
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookingData)
            });

            if (response.ok) {
                alert('تم إرسال طلب الحجز بنجاح! سنتواصل معك قريباً.');
                bookingForm.reset();
            } else {
                alert('حدث خطأ في إرسال الطلب. الرجاء المحاولة مرة أخرى.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('حدث خطأ في الاتصال بالخادم.');
        }
    });
}

// Handle modal booking form
const modalBookingForm = document.getElementById('modalBookingForm');
if (modalBookingForm) {
    modalBookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const bookingData = {
            name: document.getElementById('modalName').value,
            email: document.getElementById('modalEmail').value,
            phone: document.getElementById('modalPhone').value,
            tour: document.getElementById('modalTour').value,
            date: document.getElementById('modalDate').value,
            message: document.getElementById('modalMessage').value,
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookingData)
            });

            if (response.ok) {
                alert('تم إرسال طلب الحجز بنجاح! سنتواصل معك قريباً.');
                modalBookingForm.reset();
                modal.style.display = 'none';
            } else {
                alert('حدث خطأ في إرسال الطلب. الرجاء المحاولة مرة أخرى.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('حدث خطأ في الاتصال بالخادم.');
        }
    });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(44, 24, 16, 0.98)';
        navbar.style.padding = '0.5rem 0';
    } else {
        navbar.style.background = 'rgba(44, 24, 16, 0.95)';
        navbar.style.padding = '1rem 0';
    }
});

// Close mobile menu on click
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});