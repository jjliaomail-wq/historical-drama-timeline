// script.js – 讀取 Google Sheet CSV、渲染全域關鍵字與影片卡片

// ==== 設定 ==== //
// 直接使用已公開的 CSV 連結（視需求自行調整 sheet 名稱）
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1D8NGodZsduKff5VSyC4h-Su_LXOUuXq6DKoLKTh3JZs/gviz/tq?tqx=out:csv";

const allKeywordsDiv = document.getElementById('allKeywords');
const contentDiv = document.getElementById('content');

let allItems = [];
let allKeywords = [];
let currentFilter = null;

// ==== 讀取 CSV 並解析 ==== //
function loadFromSheet() {
  fetch(SHEET_CSV_URL)
    .then(resp => resp.text())
    .then(text => {
      const lines = text.trim().split(/\r?\n/);
      // 假設第一列是表頭，後續每列為一筆資料
      const rows = lines.map(l => l.split(","));
      // A = 標題、B = 影片 URL、F = 關鍵字（第 6 欄）
      const titleIdx = 0;
      const videoIdx = 1;
      const keywordIdx = 5; // 0‑based

      allItems = rows.slice(1).map(r => {
        const raw = r[keywordIdx] || '';
        const kws = raw.split(/[,;，、]/).map(k => k.trim()).filter(k => k);
        return { title: r[titleIdx] || '', video: r[videoIdx] || '', keywords: kws };
      });

      // 取得所有唯一關鍵字
      const set = new Set();
      allItems.forEach(i => i.keywords.forEach(k => set.add(k)));
      allKeywords = Array.from(set);
      renderAllKeywords();
      renderItems();
    })
    .catch(err => console.error('載入 Google Sheet 失敗', err));
}

// ==== UI 渲染 ==== //
function renderAllKeywords() {
  allKeywordsDiv.innerHTML = '';
  allKeywords.forEach(k => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = k;
    tag.addEventListener('click', () => filterByTag(k));
    allKeywordsDiv.appendChild(tag);
  });
}

function renderItems() {
  contentDiv.innerHTML = '';
  const filtered = currentFilter ? allItems.filter(i => i.keywords.includes(currentFilter)) : allItems;
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title;
    card.appendChild(title);

    if (item.video) {
      const video = document.createElement('a');
      video.className = 'video';
      video.href = item.video;
      video.target = '_blank';
      video.textContent = '▶️ 觀看影片';
      card.appendChild(video);
    }

    // 顯示此筆的關鍵字文字
    if (item.keywords.length) {
      const kwPara = document.createElement('p');
      kwPara.className = 'item-keywords';
      kwPara.textContent = '關鍵字：' + item.keywords.join(', ');
      card.appendChild(kwPara);
    }

    // 個別關鍵字標籤（可點擊篩選）
    const tags = document.createElement('div');
    tags.className = 'tags';
    item.keywords.forEach(k => {
      const tg = document.createElement('span');
      tg.className = 'tag';
      tg.textContent = k;
      tg.addEventListener('click', () => filterByTag(k));
      tags.appendChild(tg);
    });
    card.appendChild(tags);

    contentDiv.appendChild(card);
  });
}

function filterByTag(tag) {
  currentFilter = tag;
  renderItems();
}

// 點擊空白處取消篩選
document.body.addEventListener('click', e => {
  if (!e.target.closest('.tag')) {
    currentFilter = null;
    renderItems();
  }
});

// === 初始化 === //
// 直接載入 Google Sheet 資料
loadFromSheet();


// ---------- 讀取 Excel ----------
const fileInput = document.getElementById('excelFile');
const allKeywordsDiv = document.getElementById('allKeywords');
const contentDiv = document.getElementById('content');

let allKeywordsSet = new Set();
let currentFilter = null;

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const data = new Uint8Array(ev.target.result);
    const wb = XLSX.read(data, {type: 'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header: 1});
    // 假設 A = 標題, B = 影片 URL, F = 關鍵字 (逗號分隔)
    const titleIdx = 0;   // A
    const videoIdx = 1;   // B
    const keywordIdx = 5; // F (0‑based)

    const items = rows.slice(1).map(r => {
      const raw = (r[keywordIdx] || '').toString();
      const kws = raw.split(/[,;，、]/).map(k => k.trim()).filter(k => k);
      kws.forEach(k => allKeywordsSet.add(k));
      return {title: r[titleIdx] || '', video: r[videoIdx] || '', keywords: kws};
    });
    renderAllKeywords();
    renderItems(items);
  };
  reader.readAsArrayBuffer(file);
});

// ---------- 渲染全域關鍵字 ----------
function renderAllKeywords(){
  allKeywordsDiv.innerHTML = '';
  const tags = Array.from(allKeywordsSet).sort();
  tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    span.addEventListener('click', () => filterByTag(tag));
    allKeywordsDiv.appendChild(span);
  });
}

// ---------- 渲染影片卡片 ----------
function renderItems(items){
  const filtered = currentFilter
    ? items.filter(it => it.keywords.includes(currentFilter))
    : items;
  contentDiv.innerHTML = '';
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title;
    card.appendChild(title);

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'tags';
    item.keywords.forEach(k => {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = k;
      t.addEventListener('click', () => filterByTag(k));
      tagsDiv.appendChild(t);
    });
    card.appendChild(tagsDiv);

    if(item.video){
      const vid = document.createElement('a');
      vid.className = 'video';
      vid.href = item.video;
      vid.target = '_blank';
      vid.textContent = '▶️ 觀看影片';
      card.appendChild(vid);
    }
    contentDiv.appendChild(card);
  });
}

// ---------- 篩選 ----------
function filterByTag(tag){
  currentFilter = tag;
  // 重新讀檔會自動重新渲染，這裡只更新卡片
  // 重新觸發 change 事件不必要，直接呼叫 renderItems 需保留 items 資料
  // 為簡潔，重新讀取檔案會再次產生 items，故直接觸發 click 會更新 allKeywords
  // 實作上保留上一批 items 在全域變數
  // 此範例為簡化版：重新讀取檔案以便過濾
  fileInput.dispatchEvent(new Event('change'));
}

// 點擊空白取消過濾
document.body.addEventListener('click', e => {
  if(!e.target.closest('.tag')){
    currentFilter = null;
    fileInput.dispatchEvent(new Event('change'));
  }
});
