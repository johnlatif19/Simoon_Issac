// public/auth.js
const API_URL = window.location.origin;

// Check if user is already logged in
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (token) {
        // Verify token with server
        fetch('/api/verify-token', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).then(response => {
            if (!response.ok) {
                localStorage.removeItem('adminToken');
                if (window.location.pathname.includes('dashboard.html')) {
                    window.location.href = 'login.html';
                }
            } else if (window.location.pathname.includes('login.html')) {
                window.location.href = 'dashboard.html';
            }
        });
    } else if (window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'login.html';
    }
}

// Handle login form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('adminToken', data.token);
                window.location.href = 'dashboard.html';
            } else {
                errorDiv.textContent = data.message || 'خطأ في البريد الإلكتروني أو كلمة المرور';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Error:', error);
            errorDiv.textContent = 'حدث خطأ في الاتصال بالخادم';
            errorDiv.style.display = 'block';
        }
    });
}

// Logout function
function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = 'login.html';
}

// Check authentication on page load
checkAuth();