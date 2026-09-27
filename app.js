/* 工时统计 PWA · app.js
 * 数据层 localStorage（持久化最稳）· 日历视图 · 录入表单 · 统计 · 设置 · 主题 · 离线
 * v2 修复：IndexedDB 在国产浏览器 WebView 下不持久，改用 localStorage + persist 请求 + 回读校验
 */
(function () {
  "use strict";

  /* ---------- localStorage 数据层 ---------- */
  const KEY = "wt_data_v2";
  let mem = null;

  function loadData() {
    try {
      const raw = localStorage.getItem(KEY);
      mem = raw ? JSON.parse(raw) : null;
    } catch (e) { mem = null; }
    if (!mem || typeof mem !== "object") {
      mem = { worklogs: [], projects: [], worktypes: [], seq: 1 };
    }
    if (!Array.isArray(mem.worklogs)) mem.worklogs = [];
    if (!Array.isArray(mem.projects)) mem.projects = [];
    if (!Array.isArray(mem.worktypes)) mem.worktypes = [];
    if (typeof mem.seq !== "number") mem.seq = 1;
    return mem;
  }

  function saveData() {
    try {
      localStorage.setItem(KEY, JSON.stringify(mem));
      // 回读校验，确认真的写进去了
      const back = localStorage.getItem(KEY);
      if (!back) return false;
      JSON.parse(back); // 能解析才算成功
      return true;
    } catch (e) {
      console.error("保存失败", e);
      return false;
    }
  }

  function nextId() { return mem.seq++; }

  function addLog(log) {
    log.id = nextId();
    log.created_at = Date.now();
    mem.worklogs.push(log);
    return saveData();
  }
  function putLog(log) {
    const i = mem.worklogs.findIndex((x) => x.id === log.id);
    if (i >= 0) mem.worklogs[i] = { ...mem.worklogs[i], ...log };
    else { log.id = nextId(); mem.worklogs.push(log); }
    return saveData();
  }
  function delLog(id) {
    mem.worklogs = mem.worklogs.filter((x) => x.id !== id);
    return saveData();
  }
  function getLogsByDate(date) {
    return mem.worklogs.filter((x) => x.date === date);
  }
  function getLogsInRange(start, end) {
    return mem.worklogs.filter((x) => x.date >= start && x.date <= end);
  }
  function getAll(storeName) { return mem[storeName] || []; }
  function addItem(storeName, name) {
    const obj = { id: nextId(), name: name.trim(), created_at: Date.now() };
    mem[storeName].push(obj);
    saveData();
    return obj;
  }
  function delItem(storeName, id) {
    mem[storeName] = mem[storeName].filter((x) => x.id !== id);
    return saveData();
  }

  /* 请求持久化存储，防止浏览器在压力下清理 */
  function requestPersist() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  /* ---------- 工具 ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
  function fmtHours(n) {
    if (!n) return "0";
    return (Math.round(n * 100) / 100).toString();
  }
  function formatChineseDate(ds) {
    const [y, m, d] = ds.split("-").map(Number);
    const wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
    return `${y}年${m}月${d}日 周${wd}`;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 2000);
  }

  /* ---------- 主题 ---------- */
  const THEME_KEY = "wt-theme";
  function getStoredTheme() { return localStorage.getItem(THEME_KEY) || "auto"; }
  function systemDark() { return matchMedia("(prefers-color-scheme: dark)").matches; }
  function applyTheme(theme) {
    const resolved = theme === "auto" ? (systemDark() ? "dark" : "light") : theme;
    document.documentElement.setAttribute("data-theme", resolved);
  }
  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    $$("#themeSeg .seg__btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
  }
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (getStoredTheme() === "auto") applyTheme("auto"); }); } catch (e) {}

  /* ---------- 视图切换 ---------- */
  const VIEW_TITLES = { calendar: "工时统计", stats: "统计", settings: "设置" };
  function switchView(name) {
    $$(".view").forEach((v) => v.classList.toggle("hidden", v.dataset.view !== name));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    $("#viewTitle").textContent = VIEW_TITLES[name];
    if (name === "stats") renderStats();
    if (name === "settings") renderSettings();
  }

  /* ---------- 日历 ---------- */
  let calCursor = new Date();
  let dailyCache = {};
  let dayCursor = null;     // 当前打开的日期详情
  let returnToDay = false;  // 录入表单是否从日期详情打开，关闭后回到详情

  function loadMonthCache(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const logs = getLogsInRange(fmtDate(first), fmtDate(last));
    const map = {};
    logs.forEach((l) => { map[l.date] = (map[l.date] || 0) + (l.duration || 0); });
    dailyCache = map;
  }

  function renderCalendar() {
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    $("#monthLabel").textContent = `${year}年${month + 1}月`;
    loadMonthCache(year, month);

    const grid = $("#calGrid");
    grid.innerHTML = "";
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = fmtDate(new Date());

    for (let i = 0; i < startPad; i++) {
      const c = document.createElement("div");
      c.className = "cal-cell cal-cell--empty";
      grid.appendChild(c);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ds = fmtDate(date);
      const sum = dailyCache[ds];
      const c = document.createElement("button");
      c.className = "cal-cell cal-cell--active";
      if (ds === todayStr) c.classList.add("cal-cell--today");
      if (!sameMonth(date, calCursor)) c.classList.add("cal-cell--other");
      if (sum) c.classList.add("cal-cell--has");
      c.innerHTML = `<span class="cal-cell__date">${d}</span>${sum ? `<span class="cal-cell__sum">${fmtHours(sum)}h</span>` : ""}`;
      c.addEventListener("click", () => openDaySheet(ds));
      grid.appendChild(c);
    }
  }

  /* ---------- 录入表单 ---------- */
  function fillSelect(sel, items, withEmpty) {
    sel.innerHTML = "";
    if (withEmpty || items.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = items.length === 0 ? "（请先在设置中添加）" : "请选择";
      if (items.length === 0) o.disabled = true;
      sel.appendChild(o);
    }
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it.id; o.textContent = it.name;
      sel.appendChild(o);
    });
  }

  function calcDuration() {
    const s = $("#logStart").value;
    const e = $("#logEnd").value;
    if (!s || !e) return;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    $("#logDuration").value = fmtHours(mins / 60);
  }

  function openLogSheet(dateStr, logId) {
    returnToDay = true;
    $("#daySheet").classList.add("hidden");
    const projects = getAll("projects");
    const worktypes = getAll("worktypes");
    fillSelect($("#logProject"), projects, true);
    fillSelect($("#logWorktype"), worktypes, true);
    const form = $("#logForm");
    form.reset();
    $("#logId").value = "";
    $("#deleteLog").hidden = true;
    $("#logDate").value = dateStr;
    if (projects[0]) $("#logProject").value = projects[0].id;
    if (worktypes[0]) $("#logWorktype").value = worktypes[0].id;

    if (logId) {
      const log = mem.worklogs.find((l) => l.id === logId);
      if (log) {
        $("#logId").value = log.id;
        $("#logDate").value = log.date;
        $("#logProject").value = log.project || "";
        $("#logWorktype").value = log.worktype || "";
        $("#logStart").value = log.start || "";
        $("#logEnd").value = log.end || "";
        $("#logDuration").value = log.duration !== undefined ? fmtHours(log.duration) : "";
        $("#logNote").value = log.note || "";
        $("#deleteLog").hidden = false;
      }
    }
    $("#sheet").classList.remove("hidden");
  }

  function closeSheet(id) { $(id).classList.add("hidden"); }

  /* ---------- 日期详情（查看/增删改当日工时 + 备注） ---------- */
  function openDaySheet(dateStr) {
    dayCursor = dateStr;
    returnToDay = false;
    renderDayLogs(dateStr);
    $("#daySheet").classList.remove("hidden");
  }

  function closeDaySheet() {
    $("#daySheet").classList.add("hidden");
    dayCursor = null;
    returnToDay = false;
  }

  /* 关闭录入表单：若来自日期详情，刷新列表并回到详情 */
  function closeLogForm() {
    closeSheet("#sheet");
    if (returnToDay && dayCursor) {
      renderDayLogs(dayCursor);
      $("#daySheet").classList.remove("hidden");
    }
  }

  function renderDayLogs(dateStr) {
    const logs = getLogsByDate(dateStr).slice().sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    const projects = getAll("projects");
    const worktypes = getAll("worktypes");
    const pn = (id) => (projects.find((p) => p.id === id) || {}).name || "未分类";
    const wn = (id) => (worktypes.find((w) => w.id === id) || {}).name || "未分类";
    $("#dayHeadDate").textContent = formatChineseDate(dateStr);
    const total = logs.reduce((s, l) => s + (l.duration || 0), 0);
    $("#dayHeadSum").textContent = `合计 ${fmtHours(total)}h`;
    const list = $("#dayLogList");
    list.innerHTML = "";
    if (logs.length === 0) {
      list.innerHTML = '<div class="day-empty">这一天还没有记录，点下面按钮添加</div>';
      return;
    }
    logs.forEach((l) => {
      const item = document.createElement("div");
      item.className = "day-item";

      const title = document.createElement("div");
      title.className = "day-item__title";
      title.textContent = `${pn(l.project)} · ${wn(l.worktype)}`;
      item.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "day-item__meta";
      const time = l.start && l.end ? `${l.start}–${l.end} · ` : "";
      meta.textContent = `${time}${fmtHours(l.duration)}h`;
      item.appendChild(meta);

      if (l.note) {
        const note = document.createElement("div");
        note.className = "day-item__note";
        note.textContent = l.note; // textContent 防 XSS
        item.appendChild(note);
      }

      const actions = document.createElement("div");
      actions.className = "day-item__actions";
      const edit = document.createElement("button");
      edit.className = "day-item__edit";
      edit.textContent = "编辑";
      edit.addEventListener("click", () => openLogSheet(dateStr, l.id));
      const del = document.createElement("button");
      del.className = "day-item__del";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        if (!confirm("确认删除这条工时记录？")) return;
        delLog(l.id);
        toast("已删除");
        renderDayLogs(dateStr);
        renderCalendar();
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      item.appendChild(actions);

      list.appendChild(item);
    });
  }

  function openPrompt(label, cb) {
    $("#promptLabel").textContent = label;
    const form = $("#promptForm");
    form.reset();
    setTimeout(() => $("#promptInput").focus(), 50);
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = $("#promptInput").value.trim();
      if (!v) return;
      closeSheet("#promptSheet");
      cb(v);
    };
    $("#promptSheet").classList.remove("hidden");
  }

  /* 一键复制昨日日程到当前日期（只读昨日、不改动昨日数据） */
  function copyYesterday(targetDateStr) {
    const prev = fmtDate(addDays(new Date(targetDateStr + "T00:00:00"), -1));
    const src = getLogsByDate(prev);
    if (src.length === 0) { toast("昨日无记录可复制"); return; }
    src.forEach((l) => addLog({
      date: targetDateStr,
      project: l.project,
      worktype: l.worktype,
      start: l.start || "",
      end: l.end || "",
      duration: l.duration || 0,
      note: l.note || "",
    }));
    renderDayLogs(targetDateStr);
    renderCalendar();
    toast(`已复制 ${src.length} 条到${formatChineseDate(targetDateStr)}`);
  }

  /* ---------- 统计 ---------- */
  let statsRange = "week";                    // week | month | custom（往月）
  let statsMonth = new Date();                // 「往月」当前查看的月份
  let statsMonthInited = false;               // 是否已按历史数据定位过初始月份

  /* 取当前统计口径的日期区间 [startStr, endStr] */
  function statsRangeDates() {
    const now = new Date();
    if (statsRange === "week") {
      const s = startOfWeek(now);
      return [fmtDate(s), fmtDate(addDays(s, 6))];
    }
    const y = statsRange === "month" ? now.getFullYear() : statsMonth.getFullYear();
    const m = statsRange === "month" ? now.getMonth() : statsMonth.getMonth();
    return [fmtDate(new Date(y, m, 1)), fmtDate(new Date(y, m + 1, 0))];
  }

  /* 「往月」：翻到有记录的最近一个历史月份（没有就回退到上月） */
  function initStatsMonth() {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const keys = [...new Set(getAll("worklogs").map((l) => String(l.date || "").slice(0, 7)))]
      .filter((k) => /^\d{4}-\d{2}$/.test(k) && k < curKey)
      .sort();
    if (keys.length) {
      const last = keys[keys.length - 1].split("-").map(Number);
      statsMonth = new Date(last[0], last[1] - 1, 1);
    } else {
      statsMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }
  }

  function shiftStatsMonth(n) {
    const y = statsMonth.getFullYear(), m = statsMonth.getMonth() + n;
    statsMonth = new Date(y, m, 1);
    const now = new Date();
    const cap = new Date(now.getFullYear(), now.getMonth(), 1);
    if (statsMonth > cap) statsMonth = cap;   // 不允许翻到未来月份
    renderStats();
  }

  function renderStatsNav() {
    const isCustom = statsRange === "custom";
    $("#statMonthNav").classList.toggle("hidden", !isCustom);
    if (!isCustom) { $("#statRangeHint").classList.add("hidden"); return; }
    $("#statMonthLabel").textContent = `${statsMonth.getFullYear()}年${statsMonth.getMonth() + 1}月`;
    const now = new Date();
    const cap = new Date(now.getFullYear(), now.getMonth(), 1);
    $("#statNextMonth").disabled = statsMonth >= cap;
    const [s, e] = statsRangeDates();
    $("#statRangeHint").textContent = `统计区间 ${s} 至 ${e}`;
    $("#statRangeHint").classList.remove("hidden");
  }

  function renderStats() {
    const [startStr, endStr] = statsRangeDates();
    renderStatsNav();
    const logs = getLogsInRange(startStr, endStr);
    const total = logs.reduce((s, l) => s + (l.duration || 0), 0);
    const daysSet = new Set(logs.map((l) => l.date));
    $("#statTotal").textContent = fmtHours(total) + "h";
    $("#statDays").textContent = daysSet.size;
    $("#statAvg").textContent = daysSet.size ? fmtHours(total / daysSet.size) + "h" : "0";

    const projects = getAll("projects");
    const worktypes = getAll("worktypes");
    const byP = {}, byW = {};
    logs.forEach((l) => {
      const pn = (projects.find((p) => p.id === l.project) || {}).name || "未分类";
      const wn = (worktypes.find((w) => w.id === l.worktype) || {}).name || "未分类";
      byP[pn] = (byP[pn] || 0) + (l.duration || 0);
      byW[wn] = (byW[wn] || 0) + (l.duration || 0);
    });
    renderBarList("#byProject", byP, total);
    renderBarList("#byWorktype", byW, total);
    $("#projCount").textContent = `${Object.keys(byP).length} 个`;
    $("#wtCount").textContent = `${Object.keys(byW).length} 个`;
  }

  function renderBarList(sel, map, total) {
    const el = $(sel);
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) { el.innerHTML = '<div class="barlist__empty">暂无记录</div>'; return; }
    el.innerHTML = "";
    entries.forEach(([name, val]) => {
      const pct = total ? (val / total * 100) : 0;
      const item = document.createElement("div");
      item.className = "barlist__item";
      item.innerHTML = `
        <div class="barlist__top">
          <span class="barlist__name">${name}</span>
          <span class="barlist__val">${fmtHours(val)}h · ${pct.toFixed(0)}%</span>
        </div>
        <div class="barlist__track"><div class="barlist__fill" style="width:${pct}%"></div></div>`;
      el.appendChild(item);
    });
  }

  /* ---------- 设置 ---------- */
  function renderSettings() {
    renderTagList("#projectList", getAll("projects"), "projects");
    renderTagList("#worktypeList", getAll("worktypes"), "worktypes");
    const theme = getStoredTheme();
    $$("#themeSeg .seg__btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
  }

  function renderTagList(sel, items, store) {
    const el = $(sel);
    el.innerHTML = "";
    if (items.length === 0) {
      el.innerHTML = '<li class="barlist__empty">暂无，点击右上新增</li>';
      return;
    }
    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "taglist__item";
      li.innerHTML = `<span>${it.name}</span>`;
      const del = document.createElement("button");
      del.className = "taglist__del";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        delItem(store, it.id);
        renderTagList(sel, getAll(store), store);
        renderCalendar();
        toast("已删除");
      });
      li.appendChild(del);
      el.appendChild(li);
    });
  }

  /* ---------- CSV 导出 ---------- */
  function exportCSV() {
    const logs = getAll("worklogs");
    if (logs.length === 0) { toast("暂无数据可导出"); return; }
    const projects = getAll("projects");
    const worktypes = getAll("worktypes");
    const pn = (id) => (projects.find((p) => p.id === id) || {}).name || "";
    const wn = (id) => (worktypes.find((w) => w.id === id) || {}).name || "";
    logs.sort((a, b) => a.date.localeCompare(b.date));
    const rows = [["日期", "项目", "工种", "开始", "结束", "时长(h)", "备注"]];
    logs.forEach((l) => rows.push([l.date, pn(l.project), wn(l.worktype), l.start || "", l.end || "", fmtHours(l.duration), (l.note || "").replace(/\n/g, " ")]));
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `工时统计_${fmtDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出 CSV");
  }

  /* ---------- CSV 导入 ---------- */
  let pendingImport = null;   // 已解析、等待用户选择合并/覆盖的备份数据

  /* 简易 CSV 解析：支持引号包裹、字段内逗号与转义双引号 */
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = "", inQ = false;
    const s = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
        continue;
      }
      if (ch === '"') { inQ = true; continue; }
      if (ch === ",") { row.push(cur); cur = ""; continue; }
      if (ch === "\r") continue;
      if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
      cur += ch;
    }
    row.push(cur); rows.push(row);
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  /* 按名字取条目 id，不存在则新建（不落盘，由调用方统一 saveData） */
  function resolveName(store, name) {
    const hit = (mem[store] || []).find((it) => it.name === name);
    if (hit) return hit.id;
    const obj = { id: nextId(), name, created_at: Date.now() };
    mem[store].push(obj);
    return obj.id;
  }

  /* 严格日期校验：拒绝 2026-13-99 这类格式对但不存在的日期 */
  function isRealDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  /* 解析备份文本 → { logs, skipped }，容错列数与表头 */
  function parseImport(text) {
    const rows = parseCSV(text);
    if (rows.length === 0) return null;
    let start = 0;
    if (!isRealDate((rows[0][0] || "").trim())) start = 1; // 首行是表头则跳过
    const logs = [];
    let skipped = 0;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const date = (r[0] || "").trim();
      if (!isRealDate(date)) { skipped++; continue; }
      const dur = parseFloat((r[5] || "").trim());
      if (isNaN(dur) || dur < 0) { skipped++; continue; }
      logs.push({
        date,
        projectName: (r[1] || "").trim(),
        worktypeName: (r[2] || "").trim(),
        start: (r[3] || "").trim(),
        end: (r[4] || "").trim(),
        duration: dur,
        note: (r[6] || "").trim(),
      });
    }
    return { logs, skipped };
  }

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onerror = () => toast("读取文件失败");
    reader.onload = () => {
      const parsed = parseImport(reader.result);
      if (!parsed || parsed.logs.length === 0) {
        toast("未识别到有效记录，请用本程序导出的 CSV");
        return;
      }
      pendingImport = parsed;
      $("#importSummary").textContent =
        `识别到 ${parsed.logs.length} 条记录` + (parsed.skipped ? ` · 跳过 ${parsed.skipped} 行` : "");
      $("#importSheet").classList.remove("hidden");
    };
    reader.readAsText(file, "utf-8");
  }

  function closeImportSheet() {
    $("#importSheet").classList.add("hidden");
    pendingImport = null;
  }

  const DUP_SEP = "\u0001";
  function logKey(d, p, w, s, e, dur, note) {
    return [d, p, w, s, e, dur, note].join(DUP_SEP);
  }

  /* 真正写入：mode = merge（追加+去重）| replace（先清空） */
  function applyImport(mode) {
    const data = pendingImport;
    if (!data || !data.logs.length) return;
    if (mode === "replace" && !confirm("覆盖导入会先清空现有全部工时记录，确认继续？")) return;

    const seen = new Set();
    if (mode === "merge") {
      const projects = getAll("projects"), worktypes = getAll("worktypes");
      const pn = (id) => (projects.find((p) => p.id === id) || {}).name || "";
      const wn = (id) => (worktypes.find((w) => w.id === id) || {}).name || "";
      mem.worklogs.forEach((l) => seen.add(logKey(l.date, pn(l.project), wn(l.worktype), l.start || "", l.end || "", l.duration, l.note || "")));
    }

    const incoming = data.logs.map((l) => ({
      date: l.date,
      project: l.projectName ? resolveName("projects", l.projectName) : null,
      worktype: l.worktypeName ? resolveName("worktypes", l.worktypeName) : null,
      start: l.start,
      end: l.end,
      duration: l.duration,
      note: l.note,
    }));

    if (mode === "replace") mem.worklogs = [];
    let added = 0, dup = 0;
    incoming.forEach((l, i) => {
      if (mode === "merge") {
        const src = data.logs[i];
        const key = logKey(src.date, src.projectName, src.worktypeName, src.start, src.end, src.duration, src.note);
        if (seen.has(key)) { dup++; return; }
        seen.add(key);
      }
      l.id = nextId();
      l.created_at = Date.now();
      mem.worklogs.push(l);
      added++;
    });

    if (!saveData()) {
      toast("导入失败：浏览器拒绝写入本地存储");
      closeImportSheet();
      return;
    }
    loadData();               // 回读，确保界面与磁盘一致
    statsMonthInited = false; // 让「往月」重新按新数据定位
    renderCalendar();
    if (!$("#viewStats").classList.contains("hidden")) renderStats();
    toast(mode === "replace"
      ? `已覆盖导入 ${added} 条`
      : `已导入 ${added} 条` + (dup ? ` · 跳过重复 ${dup} 条` : ""));
    closeImportSheet();
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
    $("#prevMonth").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
    $("#nextMonth").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
    $("#todayBtn").addEventListener("click", () => { calCursor = new Date(); renderCalendar(); });

    $("#themeBtn").addEventListener("click", () => switchView("settings"));

    $$("#themeSeg .seg__btn").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
    $$("[data-close]").forEach((el) => el.addEventListener("click", () => { closeSheet("#sheet"); closeSheet("#promptSheet"); }));

    $("#logStart").addEventListener("input", calcDuration);
    $("#logEnd").addEventListener("input", calcDuration);

    $("#logForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("#logId").value ? Number($("#logId").value) : null;
      const duration = parseFloat($("#logDuration").value);
      if (isNaN(duration) || duration < 0) { toast("请填写时长"); return; }
      const log = {
        date: $("#logDate").value,
        project: $("#logProject").value ? Number($("#logProject").value) : null,
        worktype: $("#logWorktype").value ? Number($("#logWorktype").value) : null,
        start: $("#logStart").value,
        end: $("#logEnd").value,
        duration,
        note: $("#logNote").value.trim(),
      };
      let ok;
      if (id) { log.id = id; ok = putLog(log); }
      else { ok = addLog(log); }
      if (!ok) {
        toast("保存失败：浏览器拒绝写入本地存储");
        return;
      }
      // 回读校验
      loadData();
      const verify = mem.worklogs.find((x) => (id ? x.id === id : x.id === log.id));
      if (!verify) {
        toast("保存失败：数据未被持久化");
        return;
      }
      toast(id ? "已更新" : "已保存");
      closeLogForm();
      renderCalendar();
    });

    $("#deleteLog").addEventListener("click", () => {
      const id = Number($("#logId").value);
      if (!id) return;
      if (!confirm("确认删除这条工时记录？")) return;
      delLog(id);
      toast("已删除");
      closeLogForm();
      renderCalendar();
    });

    $$("#statsRange .seg__btn").forEach((b) => b.addEventListener("click", () => {
      $$("#statsRange .seg__btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      statsRange = b.dataset.range;
      if (statsRange === "custom" && !statsMonthInited) { initStatsMonth(); statsMonthInited = true; }
      renderStats();
    }));

    /* 往月：上/下月翻页 + 回本月 */
    $("#statPrevMonth").addEventListener("click", () => shiftStatsMonth(-1));
    $("#statNextMonth").addEventListener("click", () => shiftStatsMonth(1));
    $("#statThisMonth").addEventListener("click", () => {
      const now = new Date();
      statsMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      renderStats();
    });

    /* 日期详情：关闭 / 新增 */
    $("#dayClose").addEventListener("click", closeDaySheet);
    $("#dayBackdrop").addEventListener("click", closeDaySheet);
    $("#dayAddBtn").addEventListener("click", () => { if (dayCursor) openLogSheet(dayCursor); });
    $("#dayCopyBtn").addEventListener("click", () => { if (dayCursor) copyYesterday(dayCursor); });
    /* 录入表单：取消 / 背景 关闭后回到日期详情 */
    $("#logCancel").addEventListener("click", closeLogForm);
    $("#logBackdrop").addEventListener("click", closeLogForm);

    $("#addProject").addEventListener("click", () => {
      openPrompt("项目名称", (name) => {
        addItem("projects", name);
        renderSettings();
        toast("已添加项目");
      });
    });
    $("#addWorktype").addEventListener("click", () => {
      openPrompt("工种名称", (name) => {
        addItem("worktypes", name);
        renderSettings();
        toast("已添加工种");
      });
    });

    $("#exportCsv").addEventListener("click", exportCSV);

    /* 导入 CSV 备份 */
    $("#importCsv").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";               // 允许连续选同一个文件
      if (f) handleImportFile(f);
    });
    $("#importMerge").addEventListener("click", () => applyImport("merge"));
    $("#importReplace").addEventListener("click", () => applyImport("replace"));
    $("#importCancel").addEventListener("click", closeImportSheet);
    $("#importClose").addEventListener("click", closeImportSheet);
    $("#importBackdrop").addEventListener("click", closeImportSheet);
    $("#clearData").addEventListener("click", () => {
      if (!confirm("确认清空所有工时记录？此操作不可撤销。")) return;
      mem.worklogs = [];
      saveData();
      renderCalendar();
      toast("已清空");
    });
  }

  /* ---------- 初始化 ---------- */
  function ensureDefaults() {
    if (getAll("projects").length === 0) addItem("projects", "主项目");
    if (getAll("worktypes").length === 0) {
      addItem("worktypes", "开发");
      addItem("worktypes", "会议");
      addItem("worktypes", "文档");
    }
  }

  function init() {
    try {
      loadData();
      ensureDefaults();
      applyTheme(getStoredTheme());
      bind();
      renderCalendar();
      requestPersist();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    } catch (e) {
      console.error(e);
      toast("初始化异常：" + e.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
