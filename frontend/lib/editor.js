// frontend/lib/editor.js
const Editor = (() => {
  let scenario = null;

  function bind(onChange) {
    window.__editorOnChange = onChange;

    document.getElementById('launch-stage').addEventListener('change', (e) => {
      scenario.design.launch_stage = parseInt(e.target.value, 10);
      notify();
    });

    document.getElementById('min-elevation').addEventListener('change', (e) => {
      scenario.environment.min_elevation_deg = parseFloat(e.target.value) || 10;
      notify();
    });

    document.getElementById('isl-range').addEventListener('change', (e) => {
      scenario.environment.isl_range_km = parseFloat(e.target.value) || 3000;
      notify();
    });

    document.getElementById('btn-add-failure').addEventListener('click', addFailure);

    document.getElementById('failures-list').addEventListener('click', (e) => {
      if (e.target.dataset.del !== undefined) {
        scenario.failures.splice(parseInt(e.target.dataset.del, 10), 1);
        renderFailures();
        notify();
      }
    });

    document.getElementById('planes-editor').addEventListener('input', (e) => {
      const pid = e.target.dataset.plane;
      if (!pid) return;
      const p = scenario.design.planes.find(x => x.id === pid);
      p.raan_deg = parseFloat(e.target.value) || 0;
      notify();
    });

    document.getElementById('phase-editor').addEventListener('input', (e) => {
      const pid = e.target.dataset.plane;
      if (!pid) return;
      const p = scenario.design.planes.find(x => x.id === pid);
      p.phase_deg = parseFloat(e.target.value) || 0;
      notify();
    });
  }

  function notify() {
    if (window.__editorOnChange) window.__editorOnChange(scenario);
  }

  function load(sc) {
    scenario = sc;
    document.getElementById('launch-stage').value = String(sc.design.launch_stage);
    document.getElementById('min-elevation').value = sc.environment.min_elevation_deg;
    document.getElementById('isl-range').value = sc.environment.isl_range_km;

    document.getElementById('planes-editor').innerHTML = sc.design.planes.map(p => `
      <div class="row">
        <label>${p.id}</label>
        <input type="number" step="1" min="0" max="359"
               data-plane="${p.id}" value="${p.raan_deg}">
      </div>`).join('');

    document.getElementById('phase-editor').innerHTML = sc.design.planes.map(p => `
      <div class="row">
        <label>${p.id}</label>
        <input type="number" step="0.5" min="0" max="359"
               data-plane="${p.id}" value="${p.phase_deg}">
      </div>`).join('');

    renderFailures();
  }

  function renderFailures() {
    const list = document.getElementById('failures-list');
    if (!scenario.failures.length) {
      list.innerHTML = '<div style="color:#8b95a7;font-size:11px;">Отказов нет</div>';
      return;
    }
    list.innerHTML = scenario.failures.map((f, i) => {
      const h1 = Math.floor(f.start_s / 3600);
      const h2 = Math.floor(f.end_s / 3600);
      return `<div class="item">
        <span>${f.satellite_id}: ${h1}ч–${h2}ч</span>
        <button data-del="${i}" title="Удалить">✕</button>
      </div>`;
    }).join('');
  }

  function addFailure() {
    const satId = prompt('ID спутника (например S14):');
    if (!satId) return;
    const start = parseInt(prompt('Начало, с (например 21600 = 6ч):', '21600'), 10);
    const end = parseInt(prompt('Конец, с (например 86400 = 24ч):', '86400'), 10);
    if (isNaN(start) || isNaN(end) || start >= end) {
      alert('Некорректный интервал');
      return;
    }
    scenario.failures.push({ satellite_id: satId, start_s: start, end_s: end });
    renderFailures();
    notify();
  }

  return { bind, load, notify };
})();