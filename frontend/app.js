// frontend/app.js
const App = (() => {
  let scenario = null;
  let originalScenario = null;
  let simulation = null;
  let currentClient = null;

  async function init() {
    MapView.init('map');
    Timeline.init({ onStepChange: (step) => renderAtStep(step) });
    Editor.bind((sc) => {
      scenario = sc;
      setStatus('Конфигурация изменена — не забудьте пересчитать', 'ok');
    });
    Compare.bindClose();
    bindVulnerabilityModal();

    await loadScenarioList();
    bindUI();
  }

  function bindUI() {
    document.getElementById('scenario-select').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      await loadBuiltin(e.target.value);
    });
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) await loadFile(f);
    });
    document.getElementById('btn-run').addEventListener('click', runSimulation);
    document.getElementById('btn-reset').addEventListener('click', resetToOriginal);
    document.getElementById('btn-download').addEventListener('click', downloadScenario);
    document.getElementById('btn-export').addEventListener('click', exportResult);
    document.getElementById('btn-save').addEventListener('click', saveVariant);
    document.getElementById('btn-compare').addEventListener('click', runCompare);
    document.getElementById('btn-vulnerability').addEventListener('click', runVulnerability);

    document.getElementById('client-select').addEventListener('change', (e) => {
      currentClient = e.target.value;
      if (simulation) {
        renderAtStep(parseInt(document.getElementById('time-slider').value, 10));
      }
    });

    refreshSavedList();
  }

  function bindVulnerabilityModal() {
    document.getElementById('modal-close-vuln').onclick = () => {
      document.getElementById('modal-vulnerability').classList.add('hidden');
    };
    document.getElementById('modal-vulnerability').addEventListener('click', (e) => {
      if (e.target.id === 'modal-vulnerability') e.target.classList.add('hidden');
    });
  }

  // ---------- Загрузка ----------

  async function loadScenarioList() {
    const resp = await fetch('/api/scenarios');
    const list = await resp.json();
    const sel = document.getElementById('scenario-select');
    list.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.file;
      opt.textContent = `${s.id} — ${s.title}`;
      sel.appendChild(opt);
    });
  }

  async function loadBuiltin(filename) {
    setStatus('Загрузка…', '');
    try {
      const resp = await fetch(`/api/scenarios/${filename}`);
      if (!resp.ok) throw new Error(await resp.text());
      scenario = await resp.json();
      originalScenario = JSON.parse(JSON.stringify(scenario));
      onScenarioLoaded();
    } catch (ex) {
      setStatus(`Ошибка: ${ex.message}`, 'err');
    }
  }

  async function loadFile(file) {
    setStatus('Загрузка файла…', '');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.schema_version || !data.design || !data.environment) {
        throw new Error('Не найден обязательный блок (schema_version / design / environment)');
      }
      scenario = data;
      originalScenario = JSON.parse(JSON.stringify(scenario));
      onScenarioLoaded();
    } catch (ex) {
      setStatus(`Ошибка загрузки: ${ex.message}`, 'err');
    }
  }

  function onScenarioLoaded() {
    setStatus(`Загружен: ${scenario.meta.title}`, 'ok');
    Editor.load(scenario);
    document.getElementById('recommendations-card').style.display = 'none';

    const clients = scenario.ground_sites.filter(g => g.role === 'client');
    const sel = document.getElementById('client-select');
    sel.innerHTML = clients.map(c =>
      `<option value="${c.id}">${c.id} · ${c.name}</option>`).join('');
    currentClient = clients[0]?.id || null;

    MapView.renderGround(scenario.ground_sites);
    MapView.invalidate();
  }

  // ---------- Симуляция ----------

  async function runSimulation() {
    if (!scenario) { setStatus('Сначала загрузите сценарий', 'err'); return; }
    setStatus('Расчёт…', '');
    document.getElementById('progress').classList.remove('hidden');
    document.getElementById('btn-run').disabled = true;
    try {
      const resp = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'Ошибка сервера');
      }
      simulation = await resp.json();
      window.__stepSeconds = simulation.environment.step_s;
      setStatus(`Готово. Этап ${simulation.launch_stage}, шагов: ${simulation.timeline.length}`, 'ok');

      Timeline.load(simulation.results, simulation.environment.step_s, scenario.failures);
      renderRecommendations(simulation.recommendations);
      renderAtStep(0);
    } catch (ex) {
      setStatus(`Ошибка: ${ex.message}`, 'err');
    } finally {
      document.getElementById('progress').classList.add('hidden');
      document.getElementById('btn-run').disabled = false;
    }
  }

  function renderRecommendations(recs) {
    if (!recs || !recs.length) return;
    const card = document.getElementById('recommendations-card');
    const list = document.getElementById('recommendations-list');
    list.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
    card.style.display = 'block';
  }

  function renderAtStep(step) {
    if (!simulation) return;
    const rec = simulation.timeline[step];
    if (!rec) return;

    const route = rec.routes[currentClient];
    const routeIds = new Set((route || []).filter(id => id.startsWith('S')));

    // Определяем изолированные спутники: активен, но без ISL-связей
    const islOnlyEdges = rec.edges.filter(([a, b]) =>
      a.startsWith('S') && b.startsWith('S'));
    const withISL = new Set();
    islOnlyEdges.forEach(([a, b]) => { withISL.add(a); withISL.add(b); });
    const isolated = new Set();
    rec.satellites.forEach(s => {
      if (s.active && !withISL.has(s.id)) isolated.add(s.id);
    });

    MapView.renderSatellites(rec.satellites, routeIds, isolated);
    MapView.renderISL(rec.edges, rec.satellites, scenario.ground_sites);
    MapView.renderRoute(route || [], rec.satellites, scenario.ground_sites);

    // Подсветить клиентов
    Object.keys(simulation.results).forEach(cid => {
      const hasRoute = !!rec.routes[cid];
      MapView.markClientState(cid, hasRoute);
    });
  }

  // ---------- Сброс / выгрузка ----------

  function resetToOriginal() {
    if (!originalScenario) return;
    scenario = JSON.parse(JSON.stringify(originalScenario));
    onScenarioLoaded();
    simulation = null;
    setStatus('Сброшено к исходному сценарию', 'ok');
  }

  function downloadScenario() {
    if (!scenario) return;
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.meta.id}_modified.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportResult() {
    if (!scenario || !simulation) {
      setStatus('Сначала выполните расчёт', 'err');
      return;
    }
    try {
      const resp = await fetch('/api/export-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, simulation }),
      });
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${scenario.meta.id}_result.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Результат выгружен в формате cosmo-A-result-1.0', 'ok');
    } catch (ex) {
      setStatus(`Ошибка выгрузки: ${ex.message}`, 'err');
    }
  }

  // ---------- Варианты ----------

  async function saveVariant() {
    const name = document.getElementById('variant-name').value.trim();
    if (!name) { setStatus('Введите имя варианта', 'err'); return; }
    await fetch(`/api/save/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
    document.getElementById('variant-name').value = '';
    await refreshSavedList();
    setStatus(`Сохранён вариант «${name}»`, 'ok');
  }

  async function refreshSavedList() {
    const resp = await fetch('/api/saved');
    const { names } = await resp.json();

    const list = document.getElementById('saved-list');
    list.innerHTML = names.map(n => `
      <div class="item">
        <span>${n}</span>
        <button data-name="${n}">✕</button>
      </div>`).join('');
    list.querySelectorAll('button[data-name]').forEach(btn => {
      btn.onclick = async () => {
        await fetch(`/api/saved/${encodeURIComponent(btn.dataset.name)}`, { method: 'DELETE' });
        await refreshSavedList();
      };
    });

    const a = document.getElementById('compare-a');
    const b = document.getElementById('compare-b');
    a.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    b.innerHTML = a.innerHTML;
  }

  async function runCompare() {
    const a = document.getElementById('compare-a').value;
    const b = document.getElementById('compare-b').value;
    if (!a || !b || a === b) {
      setStatus('Выберите два разных варианта', 'err');
      return;
    }
    const resp = await fetch(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    if (!resp.ok) { setStatus('Ошибка сравнения', 'err'); return; }
    const data = await resp.json();
    Compare.open(data);
  }

  // ---------- Уязвимость ----------

  async function runVulnerability() {
    if (!scenario) { setStatus('Сначала загрузите сценарий', 'err'); return; }
    setStatus('Анализ уязвимости (может занять 30–60 сек)…', '');
    document.getElementById('btn-vulnerability').disabled = true;
    try {
      const resp = await fetch('/api/vulnerability?top_n=5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      showVulnerability(data);
      setStatus('Анализ уязвимости завершён', 'ok');
    } catch (ex) {
      setStatus(`Ошибка: ${ex.message}`, 'err');
    } finally {
      document.getElementById('btn-vulnerability').disabled = false;
    }
  }

  function showVulnerability(data) {
    const body = document.getElementById('vulnerability-body');
    let html = `<p>Базовая средняя доступность по группировке: <b>${data.base_avg}%</b></p>`;
    html += `<p>Наиболее критичные аппараты (полный отказ на всём горизонте):</p>`;
    html += `<table class="vuln-table">
      <tr><th>#</th><th>Спутник</th><th>Падение доступности, %</th>
          <th>Доступность без него</th></tr>`;
    data.top.forEach((row, i) => {
      const cls = row.impact_pct > 3 ? 'vuln-critical' : '';
      html += `<tr>
        <td>${i + 1}</td>
        <td class="${cls}">${row.satellite_id}</td>
        <td class="${cls}">${row.impact_pct}%</td>
        <td>${row.new_avg}%</td>
      </tr>`;
    });
    html += `</table>`;
    html += `<p style="font-size:11px;color:#8b95a7;">
      Чем выше падение — тем важнее аппарат для связности. Отказ критичных
      спутников нарушает целостность сети.
    </p>`;
    body.innerHTML = html;
    document.getElementById('modal-vulnerability').classList.remove('hidden');
  }

  function setStatus(msg, cls) {
    const el = document.getElementById('load-status');
    el.textContent = msg;
    el.className = 'status ' + (cls || '');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);