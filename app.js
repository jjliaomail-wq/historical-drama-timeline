// =============================================
// 設定：Google 試算表網址
// =============================================
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1D8NGodZsduKff5VSyC4h-Su_LXOUuXq6DKoLKTh3JZs/edit?usp=sharing";

// =============================================
// 工具函式
// =============================================
function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|v=|embed\/)([^&?#]{11})/);
    return m ? m[1] : null;
}

function extractSheetId(url) {
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

function parseCSV(text) {
    const lines = [];
    let row = [''];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (c === '"') {
            if (inQuotes && next === '"') { row[row.length - 1] += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (c === ',' && !inQuotes) {
            row.push('');
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [''];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== '') lines.push(row);
    return lines;
}

// =============================================
// 載入 Google Sheet CSV
// =============================================
async function loadCSV(sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length <= 1) return [];

    // 欄位：A=era, B=period, C=title, D=description, E=youtubeUrl, F=keywords
    const FIELDS = ['era', 'period', 'title', 'description', 'youtubeUrl', 'keywords'];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const line = rows[i];
        if (!line[0] && !line[1] && !line[2]) continue;
        const obj = {};
        FIELDS.forEach((key, idx) => {
            let val = line[idx] ? String(line[idx]).trim() : '';
            if (key === 'youtubeUrl') {
                const md = val.match(/\(https?:\/\/[^)]+\)/);
                if (md) val = md[0].slice(1, -1);
            }
            obj[key] = val;
        });
        // 解析關鍵字（逗號/分號/中文分隔符）
        obj.keywordList = obj.keywords
            ? obj.keywords.split(/[,;，、]/).map(k => k.trim()).filter(Boolean)
            : [];
        data.push(obj);
    }
    return data.filter(r => r.title);
}

// =============================================
// 渲染：全域關鍵字標籤列
// =============================================
let currentFilter = null;
let currentSort = 'default';
let globalItems = [];
const openedDiscussions = new Set();

function renderAllKeywords(items) {
    const container = document.getElementById('allKeywords');
    if (!container) return;
    const set = new Set();
    items.forEach(it => it.keywordList.forEach(k => set.add(k)));
    const keywords = Array.from(set).sort();
    container.innerHTML = '';
    keywords.forEach(k => {
        const tag = document.createElement('span');
        tag.className = 'kw-tag';
        tag.textContent = k;
        tag.addEventListener('click', e => {
            e.stopPropagation();
            currentFilter = (currentFilter === k) ? null : k;
            document.querySelectorAll('.kw-tag').forEach(t => t.classList.remove('active'));
            if (currentFilter) tag.classList.add('active');
            renderTimeline(globalItems);
        });
        container.appendChild(tag);
    });
}

// =============================================
// 渲染：時間軸（app.js 原有功能）
// =============================================
function renderTimeline(dataList) {
    // Helper: get or init data from localStorage
    const storage = {
        getViews: title => parseInt(localStorage.getItem(`view_${title}`) || '0'),
        incViews: title => {
            const key = `view_${title}`;
            let cnt = parseInt(localStorage.getItem(key) || '0') || 0;
            cnt += 1;
            localStorage.setItem(key, cnt);
            return cnt;
        },
        getComments: title => JSON.parse(localStorage.getItem(`comments_${title}`) || '[]'),
        addComment: (title, comment) => {
            const key = `comments_${title}`;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            arr.push(comment);
            localStorage.setItem(key, JSON.stringify(arr));
        },
        getRatings: title => JSON.parse(localStorage.getItem(`ratings_${title}`) || '[]'),
        addRating: (title, rating) => {
            const key = `ratings_${title}`;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            arr.push(rating);
            localStorage.setItem(key, JSON.stringify(arr));
        }
    };

    const container = document.getElementById('timeline');
    if (!container) { console.error('找不到 #timeline 容器'); return; }
    container.innerHTML = '';

    let filtered = currentFilter
        ? dataList.filter(d => d.keywordList && d.keywordList.includes(currentFilter))
        : dataList.slice();

    if (currentSort === 'title_asc') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (currentSort === 'title_desc') {
        filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (currentSort === 'rating_desc') {
        filtered.sort((a, b) => {
            const ra = storage.getRatings(a.title);
            const rb = storage.getRatings(b.title);
            const avga = ra.length ? ra.reduce((sum, v) => sum + v, 0) / ra.length : 0;
            const avgb = rb.length ? rb.reduce((sum, v) => sum + v, 0) / rb.length : 0;
            return avgb - avga;
        });
    } else if (currentSort === 'views_desc') {
        filtered.sort((a, b) => storage.getViews(b.title) - storage.getViews(a.title));
    } else if (currentSort === 'default_desc') {
        filtered.reverse();
    }

    // 按 era 分組
    const groups = [];
    if (currentSort === 'default' || currentSort === 'default_desc') {
        const seenEras = {};
        filtered.forEach(drama => {
            const era = drama.era || '未分類';
            if (seenEras[era] === undefined) {
                seenEras[era] = groups.length;
                groups.push({ era, period: drama.period || '', items: [] });
            }
            groups[seenEras[era]].items.push(drama);
        });
    } else {
        groups.push({ era: '排序結果', period: '', items: filtered });
    }

    if (groups.length === 0 || groups.every(g => g.items.length === 0)) {
        container.innerHTML = '<p style="text-align:center;color:#d4af37;padding:40px;">目前無符合條件的資料</p>';
        return;
    }

    groups.forEach(group => {
        const section = document.createElement('div');
        section.className = 'era-section';
        section.innerHTML = `
            <div class="era-header">
                <div class="era-header-line"></div>
                <div class="era-header-text">
                    <span class="era-header-name">${group.era}</span>
                    <span class="era-header-period">${group.period}</span>
                </div>
                <div class="era-header-line"></div>
            </div>
            <div class="era-cards-grid"></div>
        `;
        container.appendChild(section);
        const grid = section.querySelector('.era-cards-grid');

        group.items.forEach(drama => {
            let youtubeHtml = '';
            const ytId = getYouTubeId(drama.youtubeUrl);
            if (ytId) {
                youtubeHtml = `
                    <a href="${drama.youtubeUrl}" target="_blank" class="yt-thumbnail-container">
                        <img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="${drama.title}" class="yt-thumbnail">
                        <div class="yt-play-btn">▶</div>
                    </a>
                `;
            }
            // 關鍵字標籤（每張卡片下方）
            const kwHtml = drama.keywordList && drama.keywordList.length
                ? `<div class="card-keywords">${drama.keywordList.map(k =>
                    `<span class="kw-tag card-kw-tag">${k}</span>`).join('')}</div>`
                : '';

            const card = document.createElement('div');
            card.className = 'timeline-item';
            // Get view count for this drama
            const viewCount = storage.getViews(drama.title);
            // Compute average rating
            const ratings = storage.getRatings(drama.title);
            const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '尚無評分';
            const roundedAvg = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
            // Render comments list
            const comments = storage.getComments(drama.title);
            const commentsHtml = comments.map(c => `<div class="comment"><span class="cmt-user">匿名</span> <span class="cmt-time">${c.time}</span><br><span class="cmt-text">${c.text}</span></div>`).join('');
            const ratingStars = Array.from({length:5},(_,i)=>`<span class="star${i < roundedAvg ? ' filled' : ''}" data-star="${i+1}">&#9733;</span>`).join('');
            
            // Check if discussion should be open
            const isDiscussOpen = openedDiscussions.has(drama.title);
            const discussClass = isDiscussOpen ? 'discussion' : 'discussion hidden';

            card.innerHTML = `
                <div class="drama-card">
                    <div class="card-text">
                        <h3 class="drama-title">${drama.title || ''}</h3>
                        <p class="drama-desc">${drama.description || ''}</p>
                        ${kwHtml}
                        <div class="view-count">瀏覽次數: ${viewCount}</div>
                        <div class="rating-section">
                            <div class="avg-rating">平均評分: ${avgRating}</div>
                            <div class="star-rating" data-title="${drama.title}">${ratingStars}</div>
                        </div>
                        <button class="toggle-discuss">討論區</button>
                        <div class="${discussClass}" data-title="${drama.title}">
                            <div class="existing-comments">
                                ${commentsHtml || '<p>尚無評論</p>'}
                            </div>
                            <div class="new-comment">
                                <textarea class="cmt-input" rows="2" placeholder="留下您的評論..."></textarea>
                                <br>
                                <button class="submit-cmt">送出評論</button>
                            </div>
                        </div>
                    </div>
                    ${youtubeHtml}
                </div>
            `;
            grid.appendChild(card);
            
            // Attach event for YouTube link click to increment view count
            const ytLink = card.querySelector('.yt-thumbnail-container');
            if (ytLink) {
                ytLink.addEventListener('click', () => {
                    const newCount = storage.incViews(drama.title);
                    const viewEl = card.querySelector('.view-count');
                    if (viewEl) {
                        viewEl.textContent = `瀏覽次數: ${newCount}`;
                    }
                });
            }

            // Attach events for rating stars
            const starContainer = card.querySelector('.star-rating');
            starContainer.addEventListener('click', e => {
                const star = e.target.closest('.star');
                if (!star) return;
                const rating = parseInt(star.getAttribute('data-star'));
                const title = starContainer.getAttribute('data-title');
                storage.addRating(title, rating);
                // Re‑render timeline to update avg rating
                renderTimeline(dataList);
            });
            // Toggle discussion area
            const toggleBtn = card.querySelector('.toggle-discuss');
            const discussDiv = card.querySelector('.discussion');
            toggleBtn.addEventListener('click', () => {
                const isHidden = discussDiv.classList.toggle('hidden');
                if (isHidden) {
                    openedDiscussions.delete(drama.title);
                } else {
                    openedDiscussions.add(drama.title);
                }
            });
            // Submit comment handling
            const submitBtn = card.querySelector('.submit-cmt');
            const textarea = card.querySelector('.cmt-input');
            submitBtn.addEventListener('click', () => {
                const text = textarea.value.trim();
                if (!text) return;
                const title = discussDiv.getAttribute('data-title');
                const comment = { text, time: new Date().toLocaleString() };
                storage.addComment(title, comment);
                textarea.value = '';
                // Re‑render timeline to show new comment
                renderTimeline(dataList);
            });
        });
    });

    // Intersection Observer 淡入動畫
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    container.querySelectorAll('.timeline-item, .era-section').forEach(el => observer.observe(el));
}

// =============================================
// 粒子背景
// =============================================
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        const size = Math.random() * 3 + 1;
        const opacity = Math.random() * 0.4 + 0.1;
        const dur = Math.random() * 15 + 10;
        p.style.cssText = `
            position:absolute;
            width:${size}px;height:${size}px;
            background:#d4af37;border-radius:50%;
            left:${Math.random() * 100}vw;top:${Math.random() * 100}vh;
            opacity:${opacity};box-shadow:0 0 ${size * 2}px #d4af37;
        `;
        p.animate([
            { transform: 'translate(0,0)', opacity },
            { transform: `translate(${Math.random() * 60 - 30}px,-${Math.random() * 100 + 50}px)`, opacity: 0 }
        ], { duration: dur * 1000, delay: Math.random() * 5000, iterations: Infinity, easing: 'ease-in-out' });
        container.appendChild(p);
    }
}

// =============================================
// 主入口
// =============================================
async function loadData() {
    const sheetId = extractSheetId(GOOGLE_SHEET_CSV_URL);
    if (!sheetId) { console.error('無法解析 sheetId'); return; }
    try {
        const items = await loadCSV(sheetId);
        console.log('✅ 取得資料筆數:', items.length);
        globalItems = items;
        renderAllKeywords(items);
        renderTimeline(items);
    } catch (e) {
        console.error('❌ 載入試算表失敗:', e);
    }
}

function updateSiteViews() {
    let views = parseInt(localStorage.getItem('site_total_views') || '0');
    views += 1;
    localStorage.setItem('site_total_views', views);
    const siteViewsEl = document.getElementById('site-views');
    if (siteViewsEl) {
        siteViewsEl.textContent = views;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateSiteViews();
    loadData();
    createParticles();
    // 每 2 分鐘自動更新
    setInterval(loadData, 2 * 60 * 1000);

    // 初始化排序選單
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', e => {
            currentSort = e.target.value;
            renderTimeline(globalItems);
        });
    }

    // 卡片上的關鍵字標籤也可篩選（event delegation）
    document.getElementById('timeline').addEventListener('click', e => {
        const tag = e.target.closest('.card-kw-tag');
        if (!tag) return;
        e.stopPropagation();
        const k = tag.textContent.trim();
        currentFilter = (currentFilter === k) ? null : k;
        // 同步更新 header 的全域標籤 active 狀態
        document.querySelectorAll('.kw-tag').forEach(t => {
            t.classList.toggle('active', t.textContent.trim() === currentFilter);
        });
        renderTimeline(globalItems);
    });
});
