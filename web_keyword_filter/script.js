(function(){
  console.log('keyword script init');

  // ==== 設定 ==== //
  const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1D8NGodZsduKff5VSyC4h-Su_LXOUuXq6DKoLKTh3JZs/export?format=csv";

  const allKeywordsDiv = document.getElementById('allKeywords');
  const contentDiv = document.getElementById('content');

  let allItems = [];
  let allKeywords = [];
  let currentFilter = null;

  function loadFromSheet() {
    fetch(SHEET_CSV_URL)
      .then(r => r.text())
      .then(text => {
        const lines = text.trim().split(/\r?\n/);
        const rows = lines.map(l => l.split(','));
        const titleIdx = 0;   // A
        const videoIdx = 1;   // B
        const keywordIdx = 5; // F
        allItems = rows.slice(1).map(r => {
          const raw = r[keywordIdx] || '';
          const kws = raw.split(/[,;，、]/).map(k => k.trim()).filter(k => k);
          return { title: r[titleIdx] || '', video: r[videoIdx] || '', keywords: kws };
        });
        const set = new Set();
        allItems.forEach(it => it.keywords.forEach(k => set.add(k)));
        allKeywords = Array.from(set);
        renderAllKeywords();
        console.log('rendered', allKeywords.length, 'keywords');
        renderItems();
      })
      .catch(err => console.error('載入 Google Sheet 失敗', err));
  }

  function renderAllKeywords() {
    allKeywordsDiv.innerHTML = '';
    allKeywords.sort().forEach(k => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = k;
      tag.addEventListener('click', () => filterByTag(k));
      allKeywordsDiv.appendChild(tag);
    });
  }

  function renderItems() {
    contentDiv.innerHTML = '';
    const filtered = currentFilter ? allItems.filter(it => it.keywords.includes(currentFilter)) : allItems;
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title;
      card.appendChild(title);
      if (item.video) {
        const link = document.createElement('a');
        link.className = 'video';
        link.href = item.video;
        link.target = '_blank';
        link.textContent = '▶️ 觀看影片';
        card.appendChild(link);
      }
      if (item.keywords.length) {
        const kwPara = document.createElement('p');
        kwPara.className = 'item-keywords';
        kwPara.textContent = '關鍵字：' + item.keywords.join(', ');
        card.appendChild(kwPara);
      }
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'tags';
      item.keywords.forEach(k => {
        const tg = document.createElement('span');
        tg.className = 'tag';
        tg.textContent = k;
        tg.addEventListener('click', () => filterByTag(k));
        tagsDiv.appendChild(tg);
      });
      card.appendChild(tagsDiv);
      contentDiv.appendChild(card);
    });
  }

  function filterByTag(tag) {
    currentFilter = tag;
    renderItems();
  }

  document.body.addEventListener('click', e => {
    if (!e.target.closest('.tag')) {
      currentFilter = null;
      renderItems();
    }
  });

  // expose for inline check
  window.loadFromSheet = loadFromSheet;
  // initial load
  loadFromSheet();
})();
