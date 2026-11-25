/*
 * Integração Web Bluetooth – Xiaomi Mi Body Composition Scale 2 (XMTZC05HM / "MIBFS")
 *
 * Funciona no Chrome para Android e no Chrome/Edge desktop (Web Bluetooth).
 * Não funciona no iPhone (Safari/Chrome iOS não suportam Web Bluetooth).
 *
 * Protocolo (mesmo formato do openScale / xiaomi-ble):
 *   Serviço Body Composition 0x181B
 *     - 0x2A9C  Body Composition Measurement → medição ao vivo (notify/indicate)
 *     - 00002a2f-0000-3512-2118-0009af100700 → histórico de medições guardadas na balança
 *   Cada registro tem 13 bytes:
 *     [0] ctrl0 (bit0 = libras)   [1] ctrl1 (bit1 = tem impedância, bit5 = estabilizado,
 *                                            bit6 = catty/jin, bit7 = carga removida)
 *     [2..3] ano LE  [4] mês  [5] dia  [6] hora  [7] min  [8] seg
 *     [9..10] impedância LE (ohms)  [11..12] peso LE (kg = valor/200)
 */
(function () {
  const SVC_BODY_COMP = 0x181b;
  const CHR_BODY_COMP_MEAS = 0x2a9c;
  const CHR_HISTORY = '00002a2f-0000-3512-2118-0009af100700';
  const SVC_CURRENT_TIME = 0x1805;
  const CHR_CURRENT_TIME = 0x2a2b;

  const LS_MEASUREMENTS = 'nutri_scale_measurements';
  const LS_PROFILE = 'nutri_scale_profile';
  const LS_USER_ID = 'nutri_scale_user_id';
  const PLAN_START = new Date(2026, 10, 8); // 08/11/2026 (dia 0 do gráfico)

  let device = null;
  let lastLiveKey = '';
  let historyBuffer = [];

  // ---------------------------------------------------------------- Persistência
  function loadMeasurements() {
    try { return JSON.parse(localStorage.getItem(LS_MEASUREMENTS)) || []; } catch (e) { return []; }
  }
  function saveMeasurements(list) {
    localStorage.setItem(LS_MEASUREMENTS, JSON.stringify(list));
  }
  function loadProfile() {
    const def = { height: 175, age: 30, sex: 1 };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(LS_PROFILE)) || {}); } catch (e) { return def; }
  }
  function getUserId() {
    let id = parseInt(localStorage.getItem(LS_USER_ID), 10);
    if (!id) {
      id = 1 + Math.floor(Math.random() * 65000);
      localStorage.setItem(LS_USER_ID, id);
    }
    return id;
  }

  // ---------------------------------------------------------------- Parsing
  function parseRecord(dv, offset) {
    const ctrl0 = dv.getUint8(offset);
    const ctrl1 = dv.getUint8(offset + 1);
    const isLbs = (ctrl0 & 0x01) !== 0;
    const isCatty = (ctrl1 & 0x40) !== 0;
    const hasImpedance = (ctrl1 & 0x02) !== 0;
    const stabilized = (ctrl1 & 0x20) !== 0;
    const removed = (ctrl1 & 0x80) !== 0;
    const year = dv.getUint16(offset + 2, true);
    const date = new Date(year, dv.getUint8(offset + 4) - 1, dv.getUint8(offset + 5),
      dv.getUint8(offset + 6), dv.getUint8(offset + 7), dv.getUint8(offset + 8));
    const impedance = dv.getUint16(offset + 9, true);
    const rawWeight = dv.getUint16(offset + 11, true);
    let weight;
    if (isLbs) weight = (rawWeight / 100) * 0.45359237;
    else if (isCatty) weight = (rawWeight / 100) * 0.5;
    else weight = rawWeight / 200;
    return {
      weight: Math.round(weight * 100) / 100,
      impedance: hasImpedance && impedance > 0 && impedance < 3000 ? impedance : null,
      stabilized, removed,
      date: year > 2000 ? date : new Date()
    };
  }

  // ---------------------------------------------------------------- Composição corporal
  // Fórmulas da biblioteca MiScaleLib (openScale), as mesmas usadas pelo app Zepp Life.
  function bodyComposition(weight, impedance, p) {
    const h = p.height, age = p.age, sex = p.sex; // sex: 1 = masculino, 0 = feminino
    const bmi = weight / ((h / 100) * (h / 100));
    const out = { bmi: bmi };
    if (!impedance) return out;

    const lbmCoeff = (h * 9.058 / 100) * (h / 100) + weight * 0.32 + 12.226 - impedance * 0.0068 - age * 0.0542;

    let lbmSub = 0.8;
    if (sex === 0) lbmSub = age <= 49 ? 9.25 : 7.25;
    let coeff = 1.0;
    if (sex === 1 && weight < 61) coeff = 0.98;
    else if (sex === 0 && weight > 60) { coeff = 0.96; if (h > 160) coeff *= 1.03; }
    else if (sex === 0 && weight < 50) { coeff = 1.02; if (h > 160) coeff *= 1.03; }
    let fat = (1 - ((lbmCoeff - lbmSub) * coeff) / weight) * 100;
    if (fat > 63) fat = 75;

    let bone = (sex === 0 ? 0.245691014 : 0.18016894) - lbmCoeff * 0.05158;
    bone = -bone;
    bone = bone > 2.2 ? bone + 0.1 : bone - 0.1;
    if ((sex === 0 && bone > 5.1) || (sex === 1 && bone > 5.2)) bone = 8.0;

    let water = (100 - fat) * 0.7;
    water = water * (water < 50 ? 1.02 : 0.98);

    const muscle = weight - (fat / 100) * weight - bone;

    let visceral;
    if (sex === 1) {
      if (h < weight * 1.6) {
        const sub = -((h * 0.4) - (h * (h * 0.0826)));
        visceral = ((weight * 305) / (sub + 48)) - 2.9 + age * 0.15;
      } else {
        const sub = 0.765 + h * -0.0015;
        visceral = -((h * 0.143) - (weight * sub)) + age * 0.15 - 5.0;
      }
    } else {
      if (weight > -(13 - h * 0.5)) {
        const subsub = (h * 1.45) + (h * 0.1158) * h - 120;
        visceral = (weight * 500 / subsub) - 6 + age * 0.07;
      } else {
        const sub = 0.691 + h * -0.0024 + h * -0.0024;
        visceral = -((h * 0.027) - (sub * weight)) + age * 0.07 - age;
      }
    }

    out.fat = fat;
    out.fatMass = (fat / 100) * weight;
    out.water = water;
    out.muscle = muscle;
    out.bone = bone;
    out.visceral = Math.max(1, visceral);
    return out;
  }

  // ---------------------------------------------------------------- Integração com o gráfico
  function nearestWeekIdx(date) {
    if (typeof weightPoints === 'undefined') return -1;
    const day = (date - PLAN_START) / 86400000;
    let best = 0, bestDist = Infinity;
    weightPoints.forEach((pt, i) => {
      const d = Math.abs(pt.day - day);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  // Aplica a última pesagem de cada semana nos pontos do gráfico EWMA
  function applyMeasurementsToChart() {
    if (typeof weightPoints === 'undefined') return;
    const perWeek = {};
    loadMeasurements().forEach(m => {
      const idx = nearestWeekIdx(new Date(m.ts));
      if (idx < 0) return;
      if (!perWeek[idx] || perWeek[idx].ts < m.ts) perWeek[idx] = m;
    });
    Object.keys(perWeek).forEach(idx => {
      weightPoints[idx].raw = Math.round(perWeek[idx].weight * 10) / 10;
      weightPoints[idx].isCustom = true;
    });
    if (typeof renderAllCharts === 'function') renderAllCharts();
  }

  function storeMeasurement(rec, source) {
    const list = loadMeasurements();
    const ts = rec.date.getTime();
    // evita duplicados (mesma pesagem vinda do ao vivo + histórico)
    if (list.some(m => Math.abs(m.ts - ts) < 90000 && Math.abs(m.weight - rec.weight) < 0.15)) return false;
    list.push({ ts, weight: rec.weight, impedance: rec.impedance, source });
    list.sort((a, b) => a.ts - b.ts);
    saveMeasurements(list);
    return true;
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);

  function setStatus(text, tone) {
    const el = $('scale-status');
    if (!el) return;
    const colors = { ok: 'text-emerald-400', warn: 'text-amber-400', err: 'text-rose-400', info: 'text-[var(--muted-foreground)]' };
    el.className = 'text-[11px] ' + (colors[tone] || colors.info);
    el.textContent = text;
  }

  function fmt(v, d = 1) { return v == null || isNaN(v) ? '—' : v.toFixed(d).replace('.', ','); }

  function renderLive(rec) {
    $('scale-live-weight').textContent = fmt(rec.weight, 2);
    $('scale-live-flag').textContent = rec.removed ? 'Pesagem finalizada'
      : rec.stabilized ? (rec.impedance ? 'Estável ✓ (com bioimpedância)' : 'Estável – aguardando bioimpedância… (fique descalço)')
      : 'Medindo…';
  }

  function renderComposition(m) {
    const box = $('scale-composition');
    if (!m) { box.innerHTML = '<div class="col-span-full text-[11px] text-[var(--muted-foreground)]">Nenhuma pesagem registrada ainda.</div>'; return; }
    const c = bodyComposition(m.weight, m.impedance, loadProfile());
    const items = [
      ['Peso', fmt(m.weight, 2) + ' kg'],
      ['IMC', fmt(c.bmi)],
      ['Gordura', c.fat != null ? fmt(c.fat) + ' %' : '—'],
      ['Massa gorda', c.fatMass != null ? fmt(c.fatMass) + ' kg' : '—'],
      ['Músculo', c.muscle != null ? fmt(c.muscle) + ' kg' : '—'],
      ['Água', c.water != null ? fmt(c.water) + ' %' : '—'],
      ['Massa óssea', c.bone != null ? fmt(c.bone) + ' kg' : '—'],
      ['Gord. visceral', c.visceral != null ? fmt(c.visceral, 0) : '—'],
      ['Impedância', m.impedance ? m.impedance + ' Ω' : '—']
    ];
    box.innerHTML = items.map(([k, v]) =>
      `<div class="bg-[var(--card)] border border-[var(--border)] rounded p-2"><div class="text-[10px] text-[var(--muted-foreground)]">${k}</div><div class="text-sm font-semibold">${v}</div></div>`
    ).join('');
    const d = new Date(m.ts);
    $('scale-last-date').textContent = `Última pesagem: ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      + (m.impedance ? '' : ' • sem bioimpedância (pise descalço para medir gordura)');
  }

  function renderHistory() {
    const list = loadMeasurements();
    renderComposition(list[list.length - 1]);
    const tbody = $('scale-history');
    if (!tbody) return;
    const p = loadProfile();
    tbody.innerHTML = list.slice(-10).reverse().map(m => {
      const c = bodyComposition(m.weight, m.impedance, p);
      const d = new Date(m.ts);
      return `<tr class="border-t border-[var(--border)]"><td class="py-1">${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>`
        + `<td>${fmt(m.weight, 2)}</td><td>${c.fat != null ? fmt(c.fat) + '%' : '—'}</td><td>${c.muscle != null ? fmt(c.muscle) : '—'}</td>`
        + `<td class="text-right"><button class="text-rose-400 hover:underline" onclick="scaleDeleteMeasurement(${m.ts})">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="py-1 text-[var(--muted-foreground)]">Sem registros.</td></tr>';
  }

  function commit(rec, source) {
    if (storeMeasurement(rec, source)) {
      applyMeasurementsToChart();
      renderHistory();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Bluetooth
  function onLiveData(event) {
    const dv = event.target.value;
    if (dv.byteLength < 13) return;
    const rec = parseRecord(dv, 0);
    renderLive(rec);
    // Grava quando estabilizou com impedância, ou quando o usuário desce da balança
    if (rec.stabilized && (rec.impedance || rec.removed)) {
      const key = rec.weight + '|' + rec.impedance;
      if (key === lastLiveKey) return;
      lastLiveKey = key;
      if (commit(rec, 'ble-live')) setStatus(`✅ Pesagem salva: ${fmt(rec.weight, 2)} kg — gráfico atualizado.`, 'ok');
    }
  }

  function onHistoryData(event) {
    const dv = event.target.value;
    if (dv.byteLength === 1 && dv.getUint8(0) === 0x03) {
      finishHistory(event.target);
      return;
    }
    for (let off = 0; off + 13 <= dv.byteLength; off += 13) {
      const rec = parseRecord(dv, off);
      if (rec.weight > 0) historyBuffer.push(rec);
    }
  }

  async function finishHistory(chr) {
    let added = 0;
    historyBuffer.forEach(rec => { if (commit(rec, 'ble-history')) added++; });
    historyBuffer = [];
    try {
      await chr.writeValueWithResponse(new Uint8Array([0x03]));
      const id = getUserId();
      // confirma o recebimento para a balança não reenviar os mesmos registros
      await chr.writeValueWithResponse(new Uint8Array([0x04, 0xff, 0xff, (id >> 8) & 0xff, id & 0xff]));
    } catch (e) { /* ignorável */ }
    setStatus(added ? `✅ ${added} pesagem(ns) importada(s) do histórico da balança.` : 'Histórico sincronizado (nenhuma pesagem nova).', 'ok');
  }

  async function setScaleTime(server) {
    try {
      const svc = await server.getPrimaryService(SVC_CURRENT_TIME);
      const chr = await svc.getCharacteristic(CHR_CURRENT_TIME);
      const n = new Date();
      const buf = new Uint8Array([n.getFullYear() & 0xff, n.getFullYear() >> 8, n.getMonth() + 1, n.getDate(),
        n.getHours(), n.getMinutes(), n.getSeconds(), ((n.getDay() + 6) % 7) + 1, 0, 0]);
      await chr.writeValueWithResponse(buf);
    } catch (e) { /* nem todas as versões de firmware expõem esse serviço */ }
  }

  async function connect() {
    if (!navigator.bluetooth) {
      setStatus('❌ Este navegador não suporta Bluetooth Web. Use o Chrome no Android ou no computador (no iPhone não funciona).', 'err');
      return;
    }
    try {
      setStatus('Suba na balança para acordá-la e selecione "MIBFS" na lista…', 'info');
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'MIBFS' }, { namePrefix: 'MIBCS' }, { namePrefix: 'MI_SCALE' }, { services: [SVC_BODY_COMP] }],
        optionalServices: [SVC_BODY_COMP, SVC_CURRENT_TIME]
      });
      device.addEventListener('gattserverdisconnected', () => {
        setStatus('Balança desconectada (ela desliga sozinha após alguns segundos). Clique em conectar novamente quando quiser.', 'warn');
        $('scale-connect-btn').textContent = '🔗 Conectar balança';
      });
      setStatus('Conectando…', 'info');
      const server = await device.gatt.connect();
      await setScaleTime(server);
      const svc = await server.getPrimaryService(SVC_BODY_COMP);

      // 1) Medição ao vivo
      try {
        const live = await svc.getCharacteristic(CHR_BODY_COMP_MEAS);
        live.addEventListener('characteristicvaluechanged', onLiveData);
        await live.startNotifications();
      } catch (e) { console.warn('Medição ao vivo indisponível', e); }

      // 2) Histórico guardado na balança (pesagens feitas sem o celular por perto)
      try {
        const hist = await svc.getCharacteristic(CHR_HISTORY);
        hist.addEventListener('characteristicvaluechanged', onHistoryData);
        const id = getUserId();
        await hist.writeValueWithResponse(new Uint8Array([0x01, 0xff, 0xff, (id >> 8) & 0xff, id & 0xff]));
        await hist.startNotifications();
        historyBuffer = [];
        await hist.writeValueWithResponse(new Uint8Array([0x02]));
      } catch (e) { console.warn('Histórico indisponível', e); }

      $('scale-connect-btn').textContent = '✅ Conectada';
      setStatus('Conectada! Fique parado e descalço na balança até o valor estabilizar.', 'ok');
    } catch (e) {
      if (e && e.name === 'NotFoundError') setStatus('Nenhuma balança selecionada.', 'warn');
      else setStatus('❌ Erro: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  // ---------------------------------------------------------------- API global (usada pelo HTML)
  window.scaleConnect = connect;
  window.scaleSaveProfile = function () {
    const p = {
      height: parseFloat($('scale-height').value) || 175,
      age: parseInt($('scale-age').value, 10) || 30,
      sex: parseInt($('scale-sex').value, 10)
    };
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
    renderHistory();
    setStatus('Perfil salvo — composição corporal recalculada.', 'ok');
  };
  window.scaleDeleteMeasurement = function (ts) {
    saveMeasurements(loadMeasurements().filter(m => m.ts !== ts));
    // restaura a projeção e reaplica as pesagens restantes
    if (typeof originalWeightPoints !== 'undefined') {
      weightPoints = JSON.parse(JSON.stringify(originalWeightPoints));
    }
    applyMeasurementsToChart();
    renderHistory();
  };

  function init() {
    const p = loadProfile();
    $('scale-height').value = p.height;
    $('scale-age').value = p.age;
    $('scale-sex').value = String(p.sex);
    if (!navigator.bluetooth) {
      setStatus('⚠️ Bluetooth Web indisponível neste navegador. Abra o painel no Chrome do Android.', 'warn');
    }
    applyMeasurementsToChart();
    renderHistory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
