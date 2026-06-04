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
let globalItems = [];

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
    const container = document.getElementById('timeline');
    if (!container) { console.error('找不到 #timeline 容器'); return; }
    container.innerHTML = '';

    const filtered = currentFilter
        ? dataList.filter(d => d.keywordList && d.keywordList.includes(currentFilter))
        : dataList;

    // 按 era 分組
    const groups = [];
    const seenEras = {};
    filtered.forEach(drama => {
        const era = drama.era || '未分類';
        if (seenEras[era] === undefined) {
            seenEras[era] = groups.length;
            groups.push({ era, period: drama.period || '', items: [] });
        }
        groups[seenEras[era]].items.push(drama);
    });

    if (groups.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#d4af37;padding:40px;">目前無符合篩選條件的資料</p>';
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
            card.innerHTML = `
                <div class="drama-card">
                    <div class="card-text">
                        <h3 class="drama-title">${drama.title || ''}</h3>
                        <p class="drama-desc">${drama.description || ''}</p>
                        ${kwHtml}
                    </div>
                    ${youtubeHtml}
                </div>
            `;
            grid.appendChild(card);
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

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    createParticles();
    // 每 2 分鐘自動更新
    setInterval(loadData, 2 * 60 * 1000);
});
