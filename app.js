// =============================================
// 設定：API 網址 (Google Apps Script)
// =============================================
// 只要把部署好的 Apps Script 網址貼在下方，系統就會自動切換成「安全後端模式」。
// 如果保持空白，則會使用下方的公開 CSV 備用網址 (只存在瀏覽器的 localStorage)。
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxJvEoh_gTqB-x6GGQUAP0yOtncDoFS1vn2lkYdUtZI4GgFBtkNfIgc2yrQfrTbxPYa/exec"; 

// (備用 CSV 網址已移除，避免在公開 repo 中洩漏試算表位置)

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
let currentSortType = 'time';
let currentSortOrder = 'asc';
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
    // Helper: get or init data from localStorage or GAS data
    const storage = {
        getViews: title => {
            if (GAS_API_URL) return (globalItems.find(d => d.title === title)?.views) || 0;
            return parseInt(localStorage.getItem(`view_${title}`) || '0');
        },
        incViews: title => {
            if (GAS_API_URL) {
                const item = globalItems.find(d => d.title === title);
                if (item) item.views = (item.views || 0) + 1;
                fetch(GAS_API_URL, { method: 'POST', body: JSON.stringify({ action: 'view', title: title }) }).catch(e=>console.error(e));
                return item ? item.views : 1;
            }
            const key = `view_${title}`;
            let cnt = parseInt(localStorage.getItem(key) || '0') || 0;
            cnt += 1;
            localStorage.setItem(key, cnt);
            return cnt;
        },
        getComments: title => {
            if (GAS_API_URL) return (globalItems.find(d => d.title === title)?.comments) || [];
            return JSON.parse(localStorage.getItem(`comments_${title}`) || '[]');
        },
        addComment: (title, comment) => {
            if (GAS_API_URL) {
                const item = globalItems.find(d => d.title === title);
                if (item) {
                    if (!item.comments) item.comments = [];
                    item.comments.push(comment);
                }
                fetch(GAS_API_URL, { method: 'POST', body: JSON.stringify({ action: 'comment', title: title, comment: comment }) }).catch(e=>console.error(e));
                return;
            }
            const key = `comments_${title}`;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            arr.push(comment);
            localStorage.setItem(key, JSON.stringify(arr));
        },
        getRatings: title => {
            if (GAS_API_URL) return (globalItems.find(d => d.title === title)?.ratings) || [];
            return JSON.parse(localStorage.getItem(`ratings_${title}`) || '[]');
        },
        addRating: (title, rating) => {
            if (GAS_API_URL) {
                const item = globalItems.find(d => d.title === title);
                if (item) {
                    if (!item.ratings) item.ratings = [];
                    item.ratings.push(rating);
                }
                fetch(GAS_API_URL, { method: 'POST', body: JSON.stringify({ action: 'rating', title: title, rating: rating }) }).catch(e=>console.error(e));
                return;
            }
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

    if (currentSortType === 'time' && currentSortOrder === 'desc') {
        filtered.reverse();
    } else if (currentSortType === 'rating') {
        filtered.sort((a, b) => {
            const ra = storage.getRatings(a.title);
            const rb = storage.getRatings(b.title);
            const avga = ra.length ? ra.reduce((sum, v) => sum + v, 0) / ra.length : 0;
            const avgb = rb.length ? rb.reduce((sum, v) => sum + v, 0) / rb.length : 0;
            return currentSortOrder === 'desc' ? avgb - avga : avga - avgb;
        });
    } else if (currentSortType === 'views') {
        filtered.sort((a, b) => {
            return currentSortOrder === 'desc'
                ? storage.getViews(b.title) - storage.getViews(a.title)
                : storage.getViews(a.title) - storage.getViews(b.title);
        });
    }

    // 按 era 分組 (只有時間排序才分組)
    const groups = [];
    if (currentSortType === 'time') {
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
    try {
        let items = [];
        if (GAS_API_URL) {
            // [安全模式]：透過 Apps Script 抓取過濾後的 JSON，試算表可維持「私人」
            const res = await fetch(GAS_API_URL);
            items = await res.json();
            items.forEach(obj => {
                obj.keywordList = obj.keywords
                    ? obj.keywords.split(/[,;，、]/).map(k => k.trim()).filter(Boolean)
                    : [];
                // 確保數值型態正確
                obj.views = parseInt(obj.views) || 0;
                if (!Array.isArray(obj.ratings)) obj.ratings = [];
                if (!Array.isArray(obj.comments)) obj.comments = [];
            });
        } else {
            console.error('❌ 請設定 GAS_API_URL');
        }
        
        console.log('✅ 取得資料筆數:', items.length);
        globalItems = items;
        renderAllKeywords(items);
        renderTimeline(items);
    } catch (e) {
        console.error('❌ 載入資料失敗:', e);
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

    // 初始化排序按鈕
    const sortBtns = document.querySelectorAll('.sort-btn');
    sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-sort');
            if (currentSortType === type) {
                // Toggle order
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                // Change sort type
                currentSortType = type;
                // 預設: 評分和瀏覽優先從大到小 (desc)，時間優先從小到大 (asc)
                currentSortOrder = (type === 'time') ? 'asc' : 'desc';
            }
            
            // 更新按鈕樣式與箭頭
            sortBtns.forEach(b => {
                b.classList.remove('active');
                b.querySelector('span').textContent = '-';
            });
            btn.classList.add('active');
            btn.querySelector('span').textContent = currentSortOrder === 'asc' ? '▲' : '▼';
            
            renderTimeline(globalItems);
        });
    });

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
