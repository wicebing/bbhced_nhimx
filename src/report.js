function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

function loadMeds() {
  return new Promise(resolve => {
    try { chrome.storage.local.get(['lastMeds','scrapedAt'], data => resolve(data)); } catch (e) { const last = localStorage.getItem('lastMeds'); resolve({ lastMeds: last ? JSON.parse(last) : [], scrapedAt: null }); }
  });
}

function renderReport() {
  loadMeds().then(data => {
    document.getElementById('meta').textContent = '抓取時間: ' + (data.scrapedAt || '無');
    const meds = data.lastMeds || [];
    const report = document.getElementById('report');
    report.innerHTML = '';

    // priority categories first
    const priority = ['SGLT2','Antiplatelet','NOAC','Warfarin','Heparin'];
    const byCategory = meds.reduce((acc,m)=>{ (acc[m.category]=acc[m.category]||[]).push(m); return acc; }, {});

    function makeSection(title, list){
      const box = el('div','category');
      box.appendChild(el('h2',null,title + ' ('+list.length+')'));
      const ul = el('ul','meds');
      list.forEach(m=>{
        const li = el('li','med');
        if (m.active) li.classList.add('active');
        if (priority.includes(m.category)) li.classList.add('important');
        li.appendChild(el('div','name', (m.drugName||m.components||m.name||m.raw)));
        li.appendChild(el('div','meta', (m.visitDate? (new Date(m.visitDate).toLocaleDateString() + ' ') : '') + (m.dose||'') + ' / ' + (m.days||'')));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      return box;
    }

    // render priority categories first (always show these; display "無使用" when empty)
    priority.forEach(cat => {
      const list = byCategory[cat] || [];
      if (list.length) {
        report.appendChild(makeSection(cat + '（重點）', list));
      } else {
        // empty section with explicit "無使用"
        const box = el('div', 'category');
        box.appendChild(el('h2', null, cat + ' (0)（重點）'));
        const none = el('div', 'none', '無使用');
        box.appendChild(none);
        report.appendChild(box);
      }
    });

    // then render any other categories
    const others = Object.keys(byCategory).filter(c=>!priority.includes(c)).sort();
    others.forEach(cat=>{
      report.appendChild(makeSection(cat, byCategory[cat]));
    });
  });
}

document.addEventListener('DOMContentLoaded', renderReport);
