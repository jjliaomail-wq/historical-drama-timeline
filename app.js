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
    const container = document.getElementById('timeline');
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

// 簡易且強大的 CSV 解析器，支援雙引號、逗號與換行
function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];
        
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++; // 跳過下一個雙引號
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') { i++; }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

// 用標準 fetch 載入試算表發布的 CSV（相容性最好，完全不依賴 Google JS 庫）
async function loadFromGoogleSheet(sheetId) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
    const text = await res.text();
    
    const parsedLines = parseCSV(text);
    if (parsedLines.length <= 1) return [];

    const FIELD_NAMES = ['era', 'period', 'title', 'description', 'youtubeUrl'];
    const rows = [];

    // 跳過第一行 (header)
    for (let i = 1; i < parsedLines.length; i++) {
        const line = parsedLines[i];
        if (line.length === 0 || !line[0] && !line[1] && !line[2]) continue; // 跳過空行
        
        const obj = {};
        FIELD_NAMES.forEach((key, colIndex) => {
            let val = line[colIndex] ? String(line[colIndex]).trim() : '';
            // 清理 Markdown 連結格式 [text](url) → 只保留 url
            if (key === 'youtubeUrl') {
                const mdMatch = val.match(/\(https?:\/\/[^)]+\)/);
                if (mdMatch) val = mdMatch[0].slice(1, -1);
            }
            obj[key] = val;
        });
        rows.push(obj);
    }

    // 過濾掉 title 是空白的列
    return rows.filter(r => r.title);
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
