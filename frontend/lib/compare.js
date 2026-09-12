// frontend/lib/compare.js
const Compare = (() => {
  function open(data) {
    const modal = document.getElementById('modal-compare');
    const body = document.getElementById('compare-body');

    const a = data.a, b = data.b;
    let html = `<p><b>A:</b> ${a.meta.title} (этап ${a.launch_stage}) &nbsp;|&nbsp;
                <b>B:</b> ${b.meta.title} (этап ${b.launch_stage})</p>`;

    html += `<table class="compare-table">
      <tr>
        <th>Клиент</th>
        <th>Доступность A</th>
        <th>Доступность B</th>
        <th>Δ</th>
        <th>Макс. перерыв A</th>
        <th>Макс. перерыв B</th>
        <th>A ≥90%</th>
        <th>B ≥90%</th>
      </tr>`;

    for (const [client, d] of Object.entries(data.diffs)) {
      const deltaClass = d.delta_availability > 0 ? 'delta-up'
                       : d.delta_availability < 0 ? 'delta-down' : 'delta-zero';
      const sign = d.delta_availability > 0 ? '+' : '';
      html += `<tr>
        <td>${client}</td>
        <td>${d.availability_a}%</td>
        <td>${d.availability_b}%</td>
        <td class="${deltaClass}">${sign}${d.delta_availability}</td>
        <td>${d.max_gap_min_a} мин</td>
        <td>${d.max_gap_min_b} мин</td>
        <td>${d.meets_target_a ? '✅' : '❌'}</td>
        <td>${d.meets_target_b ? '✅' : '❌'}</td>
      </tr>`;
    }
    html += `</table>`;
    body.innerHTML = html;
    modal.classList.remove('hidden');
  }

  function bindClose() {
    document.getElementById('modal-close').onclick = () => {
      document.getElementById('modal-compare').classList.add('hidden');
    };
    document.getElementById('modal-compare').addEventListener('click', (e) => {
      if (e.target.id === 'modal-compare') e.target.classList.add('hidden');
    });
  }

  return { open, bindClose };
})();