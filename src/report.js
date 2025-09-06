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
      if (!list.length) {
        // empty section with explicit "無使用"
        const box = el('div', 'category');
        box.appendChild(el('h2', null, cat + ' (0)（重點）'));
        const none = el('div', 'none', '無使用');
        box.appendChild(none);
        report.appendChild(box);
        return;
      }

      // For priority categories, collapse duplicate drugs and show ordered dates
      const box = el('div','category');
      box.appendChild(el('h2', null, cat + '（重點） (' + list.length + ')'));

      // group by normalized drug name
      const groups = {};
      list.forEach(m => {
        const key = ((m.drugName || m.components || m.name || m.raw) + '').toLowerCase().trim();
        (groups[key] = groups[key] || []).push(m);
      });

      const ul = el('ul','meds');
      function fmtDate(iso) { try { return iso ? new Date(iso).toLocaleDateString() : ''; } catch (e) { return iso || ''; } }

      Object.keys(groups).forEach(k => {
        const items = groups[k];
        const sample = items[0];
        const li = el('li','med');
        if (items.some(x=>x.active)) li.classList.add('active');
        if (priority.includes(cat)) li.classList.add('important');

        // name + generic (學名)
        const nameText = sample.drugName || sample.components || sample.name || sample.raw || k;
        const nameDiv = el('div','name', nameText);
        const genericText = (sample.components || (sample.raw ? sample.raw.split('\n')[0] : '')).trim();
        const nameKey = (nameText + '').toLowerCase().trim();
        const genericKey = (genericText + '').toLowerCase().trim();
        if (genericKey && genericKey !== nameKey) {
          const gEl = el('div','generic', genericText);
          gEl.style.fontSize = '0.9em';
          gEl.style.fontStyle = 'italic';
          gEl.style.color = '#444';
          nameDiv.appendChild(gEl);
        }
        li.appendChild(nameDiv);

        const dates = items.map(x => x.visitDate).filter(Boolean).map(d => ({ raw:d, t: new Date(d).getTime() })).sort((a,b)=>a.t-b.t).map(x=>fmtDate(x.raw));
        const metaParts = [];
        if (sample.dose) metaParts.push(sample.dose);
        if (dates.length) metaParts.push('日期: ' + dates.join('、'));
        else metaParts.push(sample.visitDate ? fmtDate(sample.visitDate) : (sample.raw ? sample.raw.split('\n')[0] : ''));
        if (sample.days) metaParts.push('/ ' + sample.days);
        li.appendChild(el('div','meta', metaParts.join(' ')));
        ul.appendChild(li);
      });

      box.appendChild(ul);
      report.appendChild(box);
    });

    // then render any other categories: collapse duplicate drugs and list their visit dates
    const others = Object.keys(byCategory).filter(c=>!priority.includes(c)).sort();
    others.forEach(cat=>{
      const list = byCategory[cat] || [];
      const box = el('div','category');
      box.appendChild(el('h2',null, cat + ' (' + list.length + ')'));

      // group by normalized drug name
      const groups = {};
      list.forEach(m => {
        const key = ((m.drugName || m.components || m.name || m.raw) + '').toLowerCase().trim();
        (groups[key] = groups[key] || []).push(m);
      });

      const ul = el('ul','meds');
      function fmtDate(iso) { try { return iso ? new Date(iso).toLocaleDateString() : ''; } catch (e) { return iso || ''; } }

      Object.keys(groups).forEach(k => {
        const items = groups[k];
        const sample = items[0];
        const li = el('li','med');
        if (items.some(x=>x.active)) li.classList.add('active');

        // name + generic (學名)
        const nameText = sample.drugName || sample.components || sample.name || sample.raw || k;
        const nameDiv = el('div','name', nameText);
        const genericText = (sample.components || (sample.raw ? sample.raw.split('\n')[0] : '')).trim();
        const nameKey = (nameText + '').toLowerCase().trim();
        const genericKey = (genericText + '').toLowerCase().trim();
        if (genericKey && genericKey !== nameKey) {
          const gEl = el('div','generic', genericText);
          gEl.style.fontSize = '0.9em';
          gEl.style.fontStyle = 'italic';
          gEl.style.color = '#444';
          nameDiv.appendChild(gEl);
        }
        li.appendChild(nameDiv);

        const dates = items.map(x => x.visitDate).filter(Boolean).map(d => ({ raw:d, t: new Date(d).getTime() })).sort((a,b)=>a.t-b.t).map(x=>fmtDate(x.raw));
        const metaParts = [];
        if (sample.dose) metaParts.push(sample.dose);
        if (dates.length) metaParts.push('日期: ' + dates.join('、'));
        else metaParts.push(sample.raw ? sample.raw.split('\n')[0] : '');
        li.appendChild(el('div','meta', metaParts.join(' ')));
        ul.appendChild(li);
      });

      box.appendChild(ul);
      report.appendChild(box);
    });
  });
}

document.addEventListener('DOMContentLoaded', renderReport);
