// frontend/lib/timeline.js
const Timeline = (() => {
  let slider, label, canvas, ctx;
  let onStepChange = null;
  let allResults = {};        // {clientId: availability_timeline}
  let currentStep = 0;
  let playing = false;
  let playTimer = null;
  let stepCount = 0;
  let stepSeconds = 120;
  let failureRanges = [];     // [{start_step, end_step}]

  function init(opts) {
    slider = document.getElementById('time-slider');
    label = document.getElementById('time-label');
    canvas = document.getElementById('availability-chart');
    ctx = canvas.getContext('2d');
    onStepChange = opts.onStepChange;

    slider.addEventListener('input', () => {
      setStep(parseInt(slider.value, 10), true);
    });
    document.getElementById('btn-prev').onclick = () => setStep(currentStep - 1, true);
    document.getElementById('btn-next').onclick = () => setStep(currentStep + 1, true);
    document.getElementById('btn-play').onclick = togglePlay;
    window.addEventListener('resize', drawChart);
  }

  function load(results, stepSec, failures) {
    allResults = results;
    stepSeconds = stepSec;
    stepCount = Object.values(results)[0]?.availability_timeline.length || 0;
    failureRanges = (failures || []).map(f => ({
      start_step: Math.floor(f.start_s / stepSec),
      end_step: Math.ceil(f.end_s / stepSec),
    }));
    slider.max = Math.max(0, stepCount - 1);
    slider.value = 0;
    currentStep = 0;
    updateLabel();
    drawChart();
  }

  function setStep(step, fire) {
    currentStep = Math.max(0, Math.min(stepCount - 1, step));
    slider.value = currentStep;
    updateLabel();
    if (fire && onStepChange) onStepChange(currentStep);
    drawChart();
  }

  function updateLabel() {
    const sec = stepSeconds * currentStep;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    label.textContent = `t = ${sec} с (${h}ч ${m}м) · шаг ${currentStep}`;
  }

  function togglePlay() {
    playing = !playing;
    document.getElementById('btn-play').textContent = playing ? '⏸ Pause' : '▶︎ Play';
    if (playing) {
      playTimer = setInterval(() => {
        if (currentStep >= stepCount - 1) { togglePlay(); return; }
        setStep(currentStep + 1, true);
      }, 200);
    } else {
      clearInterval(playTimer);
    }
  }

  function drawChart() {
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, w, h);

    if (!stepCount) return;
    const clients = Object.keys(allResults);
    const n = clients.length;
    if (!n) return;

    const labelW = 50;
    const chartW = w - labelW;
    const rowH = h / n;
    const bw = chartW / stepCount;

    // Подсветка периодов отказов на фоне
    failureRanges.forEach(fr => {
      const x1 = labelW + fr.start_step * bw;
      const x2 = labelW + Math.min(fr.end_step, stepCount) * bw;
      ctx.fillStyle = 'rgba(248,81,73,.08)';
      ctx.fillRect(x1, 0, x2 - x1, h);
    });

    // Разделительные линии
    ctx.strokeStyle = '#2a3142';
    ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * rowH);
      ctx.lineTo(w, i * rowH);
      ctx.stroke();
    }

    clients.forEach((c, idx) => {
      const data = allResults[c].availability_timeline;
      const y = idx * rowH;

      // Подпись клиента
      ctx.fillStyle = '#e6edf3';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(c, 4, y + rowH / 2 + 4);

      // Полоса доступности
      for (let i = 0; i < data.length; i++) {
        ctx.fillStyle = data[i] ? '#3fb950' : '#f85149';
        ctx.fillRect(labelW + i * bw, y + 2, Math.max(1, bw), rowH - 4);
      }
    });

    // Маркер текущего шага
    const markerX = labelW + currentStep * bw + bw / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(markerX, 0);
    ctx.lineTo(markerX, h);
    ctx.stroke();

    // Подпись маркера
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText(`▼`, markerX - 4, 10);
  }

  return { init, load, setStep, drawChart };
})();