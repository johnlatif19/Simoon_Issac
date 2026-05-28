// public/rank.js
const API_URL = window.location.origin;

// Rating stars functionality
document.addEventListener('DOMContentLoaded', () => {
    const stars = document.querySelectorAll('.rating-input i');
    const ratingInput = document.getElementById('rankRating');

    stars.forEach(star => {
        star.addEventListener('click', function() {
            const rating = this.getAttribute('data-rating');
            ratingInput.value = rating;
            
            // Update stars display
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.className = 'fas fa-star';
                } else {
                    s.className = 'far fa-star';
                }
            });
        });

        star.addEventListener('mouseover', function() {
            const rating = this.getAttribute('data-rating');
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.className = 'fas fa-star';
                } else {
                    s.className = 'far fa-star';
                }
            });
        });

        star.addEventListener('mouseout', function() {
            const currentRating = ratingInput.value;
            stars.forEach((s, index) => {
                if (index < currentRating) {
                    s.className = 'fas fa-star';
                } else {
                    s.className = 'far fa-star';
                }
            });
        });
    });
});

// Load rankings
async function loadRankings() {
    try {
        const response = await fetch('/api/rankings');
        if (response.ok) {
            const rankings = await response.json();
            displayRankings(rankings);
        }
    } catch (error) {
        console.error('Error loading rankings:', error);
    }
}

// Display rankings
function displayRankings(rankings) {
    const grid = document.getElementById('rankingsGrid');
    if (!grid) return;

    if (rankings.length === 0) {
        grid.innerHTML = `
            <div class="empty-rankings">
                <i class="fas fa-comment-dots"></i>
                <h3>لا توجد تقييمات بعد</h3>
                <p>كن أول من يضيف تقييماً!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = rankings.map(ranking => `
        <div class="ranking-card" data-rating="${ranking.rating}">
            <div class="ranking-header">
                <div class="ranking-user">
                    <i class="fas fa-user-circle"></i>
                    <div>
                        <h4>${escapeHtml(ranking.name)}</h4>
                        <span class="country">${escapeHtml(ranking.country)}</span>
                    </div>
                </div>
                <div class="ranking-rating">
                    ${generateStars(ranking.rating)}
                </div>
            </div>
            <div class="ranking-message">
                <i class="fas fa-quote-right"></i>
                <p>${escapeHtml(ranking.message)}</p>
            </div>
            <div class="ranking-date">
                <i class="far fa-calendar-alt"></i>
                <span>${formatDate(ranking.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

// Generate stars HTML
function generateStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<i class="fas fa-star"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

// Filter rankings
function setupFilter() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const cards = document.querySelectorAll('.ranking-card');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');
            
            cards.forEach(card => {
                if (filter === 'all') {
                    card.style.display = 'block';
                } else {
                    const rating = card.getAttribute('data-rating');
                    if (rating === filter) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                }
            });
        });
    });
}

// Submit new ranking
const rankForm = document.getElementById('rankForm');
if (rankForm) {
    rankForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('rankName').value;
        const country = document.getElementById('rankCountry').value;
        const rating = document.getElementById('rankRating').value;
        const message = document.getElementById('rankMessage').value;
        const successDiv = document.getElementById('rankMessageSuccess');

        if (!rating) {
            alert('الرجاء اختيار تقييم');
            return;
        }

        const rankingData = {
            name: name,
            country: country,
            rating: parseInt(rating),
            message: message,
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch('/api/rankings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(rankingData)
            });

            if (response.ok) {
                successDiv.textContent = 'تم إضافة تقييمك بنجاح! شكراً لك.';
                successDiv.style.display = 'block';
                rankForm.reset();
                // Reset stars
                const stars = document.querySelectorAll('.rating-input i');
                stars.forEach(star => star.className = 'far fa-star');
                document.getElementById('rankRating').value = '';
                
                // Reload rankings after 2 seconds
                setTimeout(() => {
                    successDiv.style.display = 'none';
                    loadRankings();
                }, 2000);
            } else {
                const error = await response.json();
                alert(error.message || 'حدث خطأ في إرسال التقييم');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('حدث خطأ في الاتصال بالخادم');
        }
    });
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
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Initialize
loadRankings();