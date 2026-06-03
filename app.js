// 請將下面這行替換為你的 Google 試算表 CSV 網址
// （將試算表發布到網路 -> 選擇 CSV 格式 -> 複製網址）
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1D8NGodZsduKff5VSyC4h-Su_LXOUuXq6DKoLKTh3JZs/edit?usp=sharing"; 

function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function renderTimeline(dataList) {
    const container = document.getElementById('timeline-content');
    container.innerHTML = '';

    // 按 era 分組，同時保持原本順序
    const groups = [];
    const seenEras = {};
    dataList.forEach(drama => {
        const era = drama.era || '未分類';
        if (seenEras[era] === undefined) {
            seenEras[era] = groups.length;
            groups.push({ era, period: drama.period || '', items: [] });
        }
        groups[seenEras[era]].items.push(drama);
    });

    groups.forEach(group => {
        // 時代標題列
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
            if (drama.youtubeUrl) {
                const ytId = getYouTubeId(drama.youtubeUrl);
                if (ytId) {
                    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                    youtubeHtml = `
                        <a href="${drama.youtubeUrl}" target="_blank" class="yt-thumbnail-container">
                            <img src="${thumbnailUrl}" alt="${drama.title} YouTube" class="yt-thumbnail">
                            <div class="yt-play-btn">▶</div>
                        </a>
                    `;
                }
            }

            const card = document.createElement('div');
            card.className = 'timeline-item';
            card.innerHTML = `
                <div class="drama-card">
                    <div class="card-text">
                        <h3 class="drama-title">${drama.title || ''}</h3>
                        <p class="drama-desc">${drama.description || ''}</p>
                    </div>
                    ${youtubeHtml}
                </div>
            `;
            grid.appendChild(card);
        });
    });

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.timeline-item, .era-section').forEach(el => observer.observe(el));
}


function createParticles() {
    const container = document.getElementById('particles');
    const particleCount = 30;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        
        const size = Math.random() * 3 + 1;
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        const opacity = Math.random() * 0.4 + 0.1;
        const animDuration = Math.random() * 15 + 10;
        
        particle.style.position = 'absolute';
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.backgroundColor = '#d4af37';
        particle.style.borderRadius = '50%';
        particle.style.left = `${posX}vw`;
        particle.style.top = `${posY}vh`;
        particle.style.opacity = opacity;
        particle.style.boxShadow = `0 0 ${size * 2}px #d4af37`;
        
        const animation = particle.animate([
            { transform: 'translate(0, 0)', opacity: opacity },
            { transform: `translate(${Math.random() * 60 - 30}px, -${Math.random() * 100 + 50}px)`, opacity: 0 }
        ], {
            duration: animDuration * 1000,
            delay: Math.random() * 5000,
            iterations: Infinity,
            easing: 'ease-in-out'
        });
        
        container.appendChild(particle);
    }
}

// 從 Google Sheet 網址中取出試算表 ID
function extractSheetId(url) {
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

// 用 Google Visualization JSONP 載入試算表（支援 file:// 直接開啟）
function loadFromGoogleSheet(sheetId) {
    return new Promise((resolve, reject) => {
        const callbackName = '_gvizCallback_' + Date.now();
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
            delete window[callbackName];
            script.remove();
            reject(new Error('timeout'));
        }, 10000);

        // 固定欄位順序，不依賴 label 名稱（A=era, B=period, C=title, D=description, E=youtubeUrl）
        const FIELD_NAMES = ['era', 'period', 'title', 'description', 'youtubeUrl'];

        window[callbackName] = function(response) {
            clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
            try {
                const table = response.table;
                if (!table || !table.rows) { resolve([]); return; }

                const rows = table.rows.map(row => {
                    const obj = {};
                    row.c.forEach((cell, i) => {
                        const key = FIELD_NAMES[i] || `col${i}`;
                        let val = cell ? String(cell.v || '').trim() : '';
                        // 清理 Markdown 連結格式 [text](url) → 只保留 url
                        if (key === 'youtubeUrl') {
                            const mdMatch = val.match(/\(https?:\/\/[^)]+\)/);
                            if (mdMatch) val = mdMatch[0].slice(1, -1);
                        }
                        obj[key] = val;
                    });
                    return obj;
                });

                // 過濾掉 title 是空白的列，以及標題行（title 欄位含括號代表是 header）
                const filtered = rows.filter(r =>
                    r.title && !r.title.includes('(') && !r.title.toLowerCase().includes('title')
                );
                resolve(filtered);
            } catch(e) {
                reject(e);
            }
        };

        // headers=0 → 讓 gviz 把所有列（包含第一列）都當作資料，我們自己跳過 header
        script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&headers=0&callback=${callbackName}`;
        script.onerror = () => { clearTimeout(timeout); reject(new Error('script load error')); };
        document.head.appendChild(script);
    });
}

async function loadData() {
    console.log('📡 loadData 開始，URL:', GOOGLE_SHEET_CSV_URL);
    if (GOOGLE_SHEET_CSV_URL && GOOGLE_SHEET_CSV_URL.trim() !== "") {
        const sheetId = extractSheetId(GOOGLE_SHEET_CSV_URL);
        console.log('📋 sheetId:', sheetId);
        if (!sheetId) {
            console.warn('無法解析試算表 ID，使用預設資料。');
            if (typeof dramas !== 'undefined') renderTimeline(dramas);
            return;
        }
        try {
            const rows = await loadFromGoogleSheet(sheetId);
            console.log('✅ 從試算表取得行數:', rows.length, rows.slice(0,2));
            if (rows.length === 0) {
                console.log('試算表目前沒有資料，顯示預設範例。');
                if (typeof dramas !== 'undefined') renderTimeline(dramas);
            } else {
                renderTimeline(rows);
            }
        } catch(err) {
            console.error('❌ 載入試算表失敗:', err);
            if (typeof dramas !== 'undefined') renderTimeline(dramas);
        }
    } else {
        console.log('⚠️ 沒有設定 URL，使用預設資料');
        if (typeof dramas !== 'undefined') renderTimeline(dramas);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    createParticles();

    // 每 2 分鐘自動重新讀取試算表
    setInterval(() => {
        console.log('🔄 自動更新試算表資料...');
        loadData();
    }, 2 * 60 * 1000);
});
