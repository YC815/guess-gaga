(function () {
  const CLIP_SECONDS = [1, 3, 7, 15];
  // 認聲音比認歌難，猜歌手模式給長一點
  const ARTIST_CLIP_SECONDS = [2, 5, 10, 20];
  const CLIP_POINTS = [100, 70, 40, 20];
  const CLUE_POINTS = [100, 60, 30];
  const RING_LENGTH = 2 * Math.PI * 54;
  // iTunes 搜尋結果前幾名視為熱門歌
  const HIT_RANK = 30;
  const LEVEL_NAMES = { hits: "經典", all: "混合", deep: "冷門" };
  const MODE_NAMES = { audio: "聽歌猜歌", clue: "線索猜歌", lyric: "歌詞猜歌", fill: "歌詞填空", artist: "猜歌手" };
  const usesAudio = (mode) => mode === "audio" || mode === "artist";
  const clipSeconds = () => (state.mode === "artist" ? ARTIST_CLIP_SECONDS : CLIP_SECONDS);
  // 猜歌手模式的主角是歌單，其他模式是選好的歌手；計分、稱號、成績圖都用這個
  const subject = () => (state.mode === "artist" && state.group ? state.group.subject : state.artist);
  const LYRIC_MODES = ["lyric", "fill"];
  // 填空的選項是歌詞片段，正確答案用這個 key
  const ANSWER_KEY = "__answer";
  const isLyricMode = (mode) => LYRIC_MODES.includes(mode);
  const isTextMode = (mode) => mode === "fill";

  const $ = (id) => document.getElementById(id);
  const screens = ["home", "loading", "play", "result"];

  const DEFAULT_ARTIST = window.ARTISTS.find((a) => a.id === "gaga");

  const state = {
    artist: DEFAULT_ARTIST,
    mode: "audio",
    totalRounds: 10,
    pool: [],
    queue: [],
    round: 0,
    score: 0,
    stage: 0,
    answered: false,
    history: [],
    current: null,
    audio: null,
    clipLimit: 0,
    rafId: 0,
  };

  const itunesCache = new Map();

  // ---------- 工具 ----------
  const pad = (n) => String(n).padStart(2, "0");
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function show(name) {
    for (const s of screens) $(`screen-${s}`).classList.toggle("active", s === name);
    window.scrollTo(0, 0);
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // localStorage 在無痕模式等情況可能丟錯，讀寫都包起來
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 存不了就算了 */
    }
  }

  const bestKey = (mode, rounds, id = subject().id) =>
    mode === "artist" ? `guess-best-${id}-artist-${rounds}` : `guess-best-${id}-${mode}-${selectedLevel()}-${rounds}`;
  const readBest = (mode, rounds) => Number(storageGet(bestKey(mode, rounds))) || 0;
  const writeBest = (mode, rounds, score) => storageSet(bestKey(mode, rounds), String(score));

  const hasCuratedClues = (artist) => Boolean(window.CLUES && window.CLUES[artist.id]);

  function selectedLevel() {
    return document.querySelector('input[name="level"]:checked').value;
  }

  const isDeep = (song) => ("deep" in song ? song.deep : song.rank >= HIT_RANK);

  function filterByLevel(songs, level) {
    if (level === "all") return songs;
    const picked = songs.filter((s) => (level === "deep" ? isDeep(s) : !isDeep(s)));
    if (picked.length >= 4) return picked;
    toast(`${LEVEL_NAMES[level]}歌不夠多，改用全部歌曲`);
    return songs;
  }

  function selectedRounds() {
    return Number(document.querySelector('input[name="rounds"]:checked').value);
  }

  function renderBest() {
    const rounds = selectedRounds();
    for (const el of document.querySelectorAll("[data-best]")) {
      const best = readBest(el.dataset.best, rounds);
      el.textContent = best ? `${LEVEL_NAMES[selectedLevel()]}・${rounds} 題最佳：${best} 分` : "";
    }
  }

  function applyTheme(colors) {
    const root = document.documentElement.style;
    root.setProperty("--accent", colors.accent);
    root.setProperty("--accent-2", colors.accent2);
    root.setProperty("--on-accent", colors.onAccent);
  }

  // ---------- 選歌手 ----------
  function selectArtist(id, { remember = true } = {}) {
    const artist = window.ARTISTS.find((a) => a.id === id) || DEFAULT_ARTIST;
    state.artist = artist;
    if (remember) storageSet("guess-artist", artist.id);

    applyTheme(artist.colors);

    $("hero-icon").textContent = artist.icon;
    $("hero-title").textContent = window.withName(artist.short, "猜歌王");
    $("hero-tagline").textContent = artist.tagline;
    document.title = window.withName(artist.short, "猜歌王");

    paintAvatar($("trigger-avatar"), artist);
    $("trigger-name").textContent = artist.name;
    $("artist-meta").textContent = artistSubline(artist);
    if (location.hash.slice(1) !== artist.id) history.replaceState(null, "", `#${artist.id}`);
    renderQuick();
    renderBest();
  }

  // ---------- 選歌手面板 ----------
  const RECENT_KEY = "guess-recent";
  const RECENT_MAX = 8;
  const picker = { tab: null };
  const byId = (id) => window.ARTISTS.find((a) => a.id === id);
  const regionOf = (artist) => window.REGIONS.find((r) => r.id === artist.region);

  function readRecent() {
    try {
      return JSON.parse(storageGet(RECENT_KEY) || "[]").filter(byId);
    } catch {
      return [];
    }
  }

  function pushRecent(id) {
    storageSet(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)));
  }

  // 頭像：中日泰文取第一個字，英文取兩個字的字首；BTS、U2 這類縮寫取前兩個字母
  function initials(name) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(name)) return [...name][0];
    const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w && !/^the$/i.test(w));
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    const word = words[0] || name;
    return word === word.toUpperCase() ? word.slice(0, 2) : word[0].toUpperCase();
  }

  function paintAvatar(el, artist) {
    el.textContent = initials(artist.name);
    el.style.background = `linear-gradient(135deg, ${artist.colors.accent}, ${artist.colors.accent2})`;
    el.style.color = artist.colors.onAccent;
  }

  function artistSubline(artist) {
    const parts = [regionOf(artist).name];
    if (artist.top) parts.push(`百大 #${artist.top}`);
    parts.push(hasCuratedClues(artist) ? `手寫題庫 ${window.CLUES[artist.id].length} 首` : "自動出題");
    return parts.join("・");
  }

  function pickerTabs() {
    const tabs = [];
    const recent = readRecent();
    if (recent.length) tabs.push({ id: "recent", name: "最近", count: recent.length });
    tabs.push({ id: "top", name: "全球百大", count: window.TOP100.length });
    tabs.push({ id: "style", name: "依風格", count: styleGroups().length });
    for (const r of window.REGIONS) {
      tabs.push({ id: r.id, name: r.name, count: window.ARTISTS.filter((a) => a.region === r.id).length });
    }
    tabs.push({ id: "all", name: "全部", count: window.ARTISTS.length });
    return tabs;
  }

  // 猜歌手的歌單照聲線、曲風分好了，拿來挑歌手比照地區分更直覺；大亂鬥是全部歌手，不算
  const styleGroups = () => window.GROUPS.filter((g) => g.id !== "mix");
  const topArtists = () => window.ARTISTS.filter((a) => a.top).sort((a, b) => a.top - b.top);

  function listForTab(tab) {
    if (tab === "recent") return readRecent().map(byId);
    if (tab === "top") return topArtists();
    if (tab === "all") return window.ARTISTS;
    if (tab === "style") return [...new Set(styleGroups().flatMap((g) => g.artists))].map(byId);
    return window.ARTISTS.filter((a) => a.region === tab);
  }

  // 比對時忽略空白和符號，「jay z」「JAY-Z」「ac dc」都找得到
  const compact = (str) => str.toLowerCase().replace(/[\s.\-'’!/&]/g, "");

  function searchArtists(query) {
    const q = compact(query);
    if (!q) return [];
    return window.ARTISTS.map((a) => {
      const name = compact(a.name);
      const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : compact(a.searchText).includes(q) ? 2 : -1;
      return { a, rank };
    })
      .filter((x) => x.rank >= 0)
      .sort((x, y) => x.rank - y.rank || (x.a.top || 999) - (y.a.top || 999))
      .map((x) => x.a);
  }

  function artistRow(artist, { showRank }) {
    const row = document.createElement("button");
    row.className = "artist-row";
    row.type = "button";
    row.setAttribute("role", "option");
    row.dataset.id = artist.id;
    const current = artist.id === state.artist.id;
    row.setAttribute("aria-selected", String(current));
    row.innerHTML = `
      <span class="row-rank"></span>
      <span class="avatar" aria-hidden="true"></span>
      <span class="row-text"><span class="row-name"></span><span class="row-sub"></span></span>
      <span class="row-check" aria-hidden="true">${current ? "✓" : ""}</span>`;
    row.querySelector(".row-rank").textContent = showRank ? String(artist.top).padStart(2, "0") : "";
    row.classList.toggle("ranked", showRank);
    paintAvatar(row.querySelector(".avatar"), artist);
    row.querySelector(".row-name").textContent = artist.name;
    row.querySelector(".row-sub").textContent = artistSubline(artist);
    return row;
  }

  function renderPicker() {
    const query = $("artist-search").value;
    const box = $("artist-results");
    box.innerHTML = "";

    const tabsBox = $("artist-tabs");
    tabsBox.classList.toggle("dimmed", Boolean(query.trim()));
    for (const tab of tabsBox.children) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === picker.tab));
    }

    if (query.trim()) {
      const found = searchArtists(query);
      $("sheet-count").textContent = `找到 ${found.length} 位`;
      if (!found.length) {
        const empty = document.createElement("p");
        empty.className = "results-empty";
        empty.textContent = `找不到「${query.trim()}」。試試英文名、中文俗稱，或換個寫法。`;
        box.appendChild(empty);
      }
      for (const a of found) box.appendChild(artistRow(a, { showRank: false }));
      return;
    }

    const list = listForTab(picker.tab);
    $("sheet-count").textContent = `${list.length} 位`;
    if (picker.tab === "style") {
      // 同一位歌手可能在好幾個歌單裡，各段都列出來
      for (const g of styleGroups()) {
        const title = document.createElement("p");
        title.className = "results-group";
        title.textContent = `${g.icon} ${g.name}`;
        box.appendChild(title);
        for (const id of g.artists) box.appendChild(artistRow(byId(id), { showRank: false }));
      }
      return;
    }
    if (picker.tab === "all") {
      // 「全部」依地區分段，段落標題會黏在上方
      for (const r of window.REGIONS) {
        const title = document.createElement("p");
        title.className = "results-group";
        title.textContent = `${r.icon} ${r.name}`;
        box.appendChild(title);
        for (const a of list.filter((x) => x.region === r.id)) box.appendChild(artistRow(a, { showRank: false }));
      }
      return;
    }
    for (const a of list) box.appendChild(artistRow(a, { showRank: picker.tab === "top" }));
  }

  function renderTabs() {
    const box = $("artist-tabs");
    box.innerHTML = "";
    for (const tab of pickerTabs()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.setAttribute("role", "tab");
      btn.dataset.tab = tab.id;
      btn.innerHTML = `<span></span><span class="tab-count">${tab.count}</span>`;
      btn.firstChild.textContent = tab.name;
      btn.addEventListener("click", () => {
        picker.tab = tab.id;
        $("artist-search").value = "";
        renderPicker();
        $("artist-results").scrollTop = 0;
      });
      box.appendChild(btn);
    }
  }

  function openPicker() {
    const dialog = $("artist-dialog");
    if (dialog.open) return;
    renderTabs();
    const tabIds = pickerTabs().map((t) => t.id);
    if (!tabIds.includes(picker.tab)) picker.tab = readRecent().length ? "recent" : "top";
    $("artist-search").value = "";
    renderPicker();
    dialog.showModal();
    $("artist-tabs").querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    const current = $("artist-results").querySelector('[aria-selected="true"]');
    if (current) current.scrollIntoView({ block: "center" });
    // 手機上自動跳出鍵盤會擋住清單，只有桌機才自動聚焦搜尋框
    if (window.matchMedia("(pointer: fine)").matches) $("artist-search").focus();
    else $("sheet-close").focus();
  }

  function choose(id) {
    pushRecent(id);
    selectArtist(id);
    for (const dialog of [$("artist-dialog"), $("draw-dialog")]) if (dialog.open) dialog.close();
    $("artist-trigger").focus({ preventScroll: true });
    const vinyl = document.querySelector(".vinyl-hero");
    vinyl.classList.remove("shuffle");
    void vinyl.offsetWidth;
    vinyl.classList.add("shuffle");
  }

  // ---------- 首頁的快速換歌手 ----------
  // 玩過的話列最近的歌手；第一次來就列百大前幾名，不用打開面板也有得選
  const QUICK_MAX = 4;

  function renderQuick() {
    const box = $("quick-artists");
    box.innerHTML = "";
    const recent = readRecent().map(byId).filter((a) => a.id !== state.artist.id);
    const list = (recent.length ? recent : topArtists().filter((a) => a.id !== state.artist.id)).slice(0, QUICK_MAX);
    const label = document.createElement("span");
    label.className = "quick-label";
    label.textContent = recent.length ? "最近" : "熱門";
    box.appendChild(label);
    for (const a of list) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.dataset.id = a.id;
      chip.innerHTML = `<span class="avatar" aria-hidden="true"></span><span class="quick-name"></span>`;
      paintAvatar(chip.querySelector(".avatar"), a);
      chip.querySelector(".quick-name").textContent = a.name;
      chip.title = `換成 ${a.name}`;
      box.appendChild(chip);
    }
  }

  // ---------- 抽歌手：一次抽三位，挑一位 ----------
  const DRAW_KEY = "guess-draw-scope";
  const DRAW_COUNT = 3;
  const drawScopes = () => [
    { id: "top", name: "全球百大", icon: "🏆", artists: () => topArtists() },
    { id: "all", name: "全部", icon: "🎲", artists: () => window.ARTISTS },
    ...styleGroups().map((g) => ({ id: g.id, name: g.name, icon: g.icon, artists: () => g.artists.map(byId) })),
  ];
  const draw = { scope: null, shown: [] };

  function currentScope() {
    const scopes = drawScopes();
    return scopes.find((x) => x.id === draw.scope) || scopes[0];
  }

  function renderDrawScopes() {
    const box = $("draw-scopes");
    box.innerHTML = "";
    for (const scope of drawScopes()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(scope.id === currentScope().id));
      btn.textContent = `${scope.icon} ${scope.name}`;
      btn.addEventListener("click", () => {
        draw.scope = scope.id;
        storageSet(DRAW_KEY, scope.id);
        for (const b of box.children) b.setAttribute("aria-selected", String(b === btn));
        drawThree();
      });
      box.appendChild(btn);
    }
  }

  // 不抽目前的歌手，也盡量不重複上一輪抽過的
  function drawThree() {
    const all = currentScope().artists().filter((a) => a.id !== state.artist.id);
    const fresh = all.filter((a) => !draw.shown.includes(a.id));
    const picked = shuffle(fresh.length >= DRAW_COUNT ? fresh : all).slice(0, DRAW_COUNT);
    draw.shown = picked.map((a) => a.id);
    const box = $("draw-cards");
    box.innerHTML = "";
    for (const a of picked) {
      const row = artistRow(a, { showRank: false });
      row.classList.add("draw-card");
      row.querySelector(".row-check").textContent = "選這位";
      box.appendChild(row);
    }
  }

  function openDraw() {
    draw.scope = draw.scope || storageGet(DRAW_KEY);
    draw.shown = [];
    renderDrawScopes();
    drawThree();
    $("draw-dialog").showModal();
    $("draw-scopes").querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    $("btn-redraw").focus();
  }

  function setupPicker() {
    const dialog = $("artist-dialog");
    $("artist-trigger").addEventListener("click", openPicker);
    $("btn-random").addEventListener("click", openDraw);
    $("quick-artists").addEventListener("click", (e) => {
      const chip = e.target.closest(".quick-chip");
      if (chip) choose(chip.dataset.id);
    });
    const drawDialog = $("draw-dialog");
    $("draw-close").addEventListener("click", () => drawDialog.close());
    drawDialog.addEventListener("close", () => $("artist-trigger").focus({ preventScroll: true }));
    drawDialog.addEventListener("click", (e) => {
      if (e.target === drawDialog) drawDialog.close();
    });
    $("btn-redraw").addEventListener("click", drawThree);
    $("draw-cards").addEventListener("click", (e) => {
      const row = e.target.closest(".artist-row");
      if (row) choose(row.dataset.id);
    });
    $("sheet-close").addEventListener("click", () => dialog.close());
    // 關閉後把焦點還給「目前歌手」卡片，不然焦點會卡在隱藏的搜尋框裡
    dialog.addEventListener("close", () => $("artist-trigger").focus({ preventScroll: true }));
    // 點到面板外的背景就關閉
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    $("artist-search").addEventListener("input", () => {
      renderPicker();
      $("artist-results").scrollTop = 0;
    });
    $("artist-results").addEventListener("click", (e) => {
      const row = e.target.closest(".artist-row");
      if (row) choose(row.dataset.id);
    });

    // 鍵盤：上下鍵在清單裡移動、左右鍵切分類、隨手打字就跳到搜尋框
    dialog.addEventListener("keydown", (e) => {
      const rows = [...$("artist-results").querySelectorAll(".artist-row")];
      const active = document.activeElement;
      const index = rows.indexOf(active);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = index === -1 ? (step > 0 ? 0 : rows.length - 1) : index + step;
        if (next < 0) $("artist-search").focus();
        else rows[Math.min(next, rows.length - 1)].focus();
      } else if (e.key === "Enter" && active === $("artist-search") && rows.length) {
        e.preventDefault();
        choose(rows[0].dataset.id);
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && active?.classList.contains("tab")) {
        e.preventDefault();
        const tabs = [...$("artist-tabs").children];
        const next = tabs[(tabs.indexOf(active) + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        next.focus();
        next.click();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && active !== $("artist-search") && e.key !== " ") {
        $("artist-search").focus();
      }
    });

    // 首頁按 / 打開面板
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || dialog.open || !$("screen-home").classList.contains("active")) return;
      if (e.target.matches("input, textarea")) return;
      e.preventDefault();
      openPicker();
    });
  }

  // ---------- 自動線索（沒有手寫題庫的歌手） ----------
  function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function autoClues(song) {
    const first = [song.year && `${song.year} 年發行`, song.genre, song.durationMs && `長度 ${formatDuration(song.durationMs)}`]
      .filter(Boolean)
      .join("・");
    const album = song.album.replace(/\s-\s(single|ep)$/i, "");
    const masked = album.replace(new RegExp(escapeRegExp(song.title), "gi"), "＿＿＿");
    const second = window.ITunes.isSingle(song.rawAlbum)
      ? "以單曲形式發行。"
      : `收錄於《${masked}》。`;
    const chars = [...song.title];
    const third = song.artwork
      ? { image: song.artwork }
      : `歌名共 ${chars.length} 個字，第一個字是「${chars[0]}」。`;
    return [first || "發行資訊不明。", second, third];
  }

  // 曲目在瀏覽器存一天，避免一直重抓而撞到 iTunes 的請求上限
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  function readSongCache(artist) {
    try {
      const cached = JSON.parse(storageGet(`guess-songs-v4-${artist.id}`) || "null");
      if (!cached || Date.now() - cached.savedAt > CACHE_TTL) return null;
      // JSON 存不了 Infinity，存成 null
      return cached.songs.map((s) => ({ ...s, rank: s.rank ?? Infinity }));
    } catch {
      return null;
    }
  }

  async function loadItunes(artist) {
    if (itunesCache.has(artist.id)) return itunesCache.get(artist.id);
    let songs = readSongCache(artist);
    if (!songs) {
      const onProgress = (msg) => ($("loading-text").textContent = msg);
      songs = await window.ITunes.fetchSongs(artist, onProgress);
      storageSet(`guess-songs-v4-${artist.id}`, JSON.stringify({ savedAt: Date.now(), songs }));
    }
    itunesCache.set(artist.id, songs);
    return songs;
  }

  // ---------- 開始 ----------
  async function startGame(mode) {
    const artist = state.artist;
    state.mode = mode;
    state.totalRounds = selectedRounds();

    if (mode === "artist") {
      applyTheme(state.group.colors);
      const ok = await buildArtistQueue();
      if (!ok) return;
    } else if (mode === "clue" && hasCuratedClues(artist)) {
      state.pool = window.CLUES[artist.id].map((s) => ({ ...s, key: window.ITunes.normalizeTitle(s.title) }));
    } else {
      show("loading");
      $("loading-text").textContent = `正在召喚 ${artist.name}……`;
      $("loading-actions").classList.add("hidden");
      try {
        const songs = await loadItunes(artist);
        state.pool = mode === "clue" ? songs.map((s) => ({ ...s, clues: autoClues(s) })) : songs;
      } catch (err) {
        console.error(err);
        const canFallback = mode === "audio" && hasCuratedClues(artist);
        const reason =
          err.code === "NOT_FOUND"
            ? `iTunes 上找不到足夠的 ${artist.name} 歌曲，可能是這位歌手沒有在 Apple Music 上架。`
            : "連不上 iTunes，抓不到歌曲資料。";
        const next = canFallback
          ? "要不要改玩線索模式？"
          : err.code === "NOT_FOUND"
            ? "換一位歌手試試看吧。"
            : "請確認網路連線後再試一次。";
        $("loading-text").textContent = reason + next;
        $("btn-loading-clue").classList.toggle("hidden", !canFallback);
        $("loading-actions").classList.remove("hidden");
        return;
      }
    }

    if (mode !== "artist") state.pool = filterByLevel(state.pool, selectedLevel());
    if (mode === "artist") {
      // 題目在 buildArtistQueue 已經排好了
    } else if (isLyricMode(mode)) {
      const ok = await buildLyricQueue(mode);
      if (!ok) return;
    } else {
      state.queue = shuffle(state.pool).slice(0, Math.min(state.totalRounds, state.pool.length));
    }
    state.totalRounds = state.queue.length;
    state.round = 0;
    state.score = 0;
    state.history = [];
    $("audio-panel").classList.toggle("hidden", !usesAudio(mode));
    $("clue-panel").classList.toggle("hidden", mode !== "clue");
    $("lyric-panel").classList.toggle("hidden", !isLyricMode(mode));
    show("play");
    nextRound();
  }

  // ---------- 每一題 ----------
  function nextRound() {
    stopAudio();
    if (state.round >= state.totalRounds) return finish();

    const song = state.queue[state.round];
    state.current = song;
    state.stage = 0;
    state.answered = false;

    $("hud-round").textContent = `${pad(state.round + 1)} / ${pad(state.totalRounds)}`;
    $("hud-score").textContent = state.score;
    $("progress-bar").style.width = `${(state.round / state.totalRounds) * 100}%`;
    $("reveal").classList.add("hidden");

    renderOptions(song);

    if (isLyricMode(state.mode)) {
      $("btn-hint").disabled = false;
      renderLyric();
    } else if (usesAudio(state.mode)) {
      state.audio = new Audio(song.previewUrl);
      state.audio.preload = "auto";
      state.audio.addEventListener("ended", () => ($("play-icon").textContent = "▶"));
      // 有聲音時唱片才轉
      state.audio.addEventListener("playing", () => $("btn-play").classList.add("is-playing"));
      for (const evt of ["pause", "ended", "emptied"]) {
        state.audio.addEventListener(evt, () => $("btn-play").classList.remove("is-playing"));
      }
      setRing(0);
      $("play-icon").textContent = "▶";
      $("btn-more").disabled = false;
      renderClipStage();
    } else {
      $("clue-list").innerHTML = "";
      $("btn-clue").disabled = false;
      addClue();
    }
    updateWorth();
  }

  function renderOptions(song) {
    let options;
    if (state.mode === "artist") {
      // 合唱歌上掛名的其他歌手、同團的團員都不能當錯誤選項，不然選了也算對
      const answer = byId(song.key);
      const clash = (a) =>
        a.match.test(song.artist || "") || (a.related || []).includes(answer.id) || (answer.related || []).includes(a.id);
      const others = shuffle(state.group.artists.filter((id) => id !== song.key && !clash(byId(id)))).slice(0, 3);
      options = shuffle([song.key, ...others]).map((id) => ({ key: id, title: byId(id).name }));
    } else if (isTextMode(state.mode)) {
      const q = song.lyricQ;
      options = shuffle([
        { key: ANSWER_KEY, title: q.answer },
        ...q.distractors.map((t, i) => ({ key: `__d${i}`, title: t })),
      ]);
    } else {
      const distractors = shuffle(state.pool.filter((s) => s.key !== song.key)).slice(0, 3);
      options = shuffle([song, ...distractors]);
    }
    const box = $("options");
    box.innerHTML = "";
    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.dataset.key = opt.key;
      btn.innerHTML = `<span class="option-num">${pad(i + 1)}</span><span class="option-text"></span>`;
      btn.querySelector(".option-text").textContent = opt.title;
      btn.addEventListener("click", () => answer(opt, btn));
      box.appendChild(btn);
    });
  }

  function currentPoints() {
    return usesAudio(state.mode) ? CLIP_POINTS[state.stage] : CLUE_POINTS[state.stage];
  }

  function updateWorth() {
    $("worth").textContent = `答對可得 ${currentPoints()} 分`;
  }

  // ---------- 聽歌模式 ----------
  function renderClipStage() {
    const sec = clipSeconds()[state.stage];
    $("clip-label").textContent = `播放 ${sec} 秒`;
    const steps = $("clip-steps");
    steps.innerHTML = "";
    clipSeconds().forEach((s, i) => {
      const dot = document.createElement("span");
      dot.className = "step" + (i <= state.stage ? " on" : "");
      dot.textContent = `${s}s`;
      steps.appendChild(dot);
    });
    const last = state.stage >= clipSeconds().length - 1;
    $("btn-more").disabled = last;
    $("btn-more").textContent = last
      ? "已經是最長片段"
      : `多聽一點（${clipSeconds()[state.stage + 1]} 秒）`;
  }

  function setRing(ratio) {
    $("ring-fg").style.strokeDashoffset = String(RING_LENGTH * (1 - Math.min(1, ratio)));
  }

  function tick() {
    const a = state.audio;
    if (!a) return;
    if (state.clipLimit !== Infinity) {
      setRing(a.currentTime / state.clipLimit);
      if (a.currentTime >= state.clipLimit) {
        a.pause();
        $("play-icon").textContent = "↻";
        return;
      }
    } else {
      setRing(a.duration ? a.currentTime / a.duration : 0);
    }
    if (!a.paused) state.rafId = requestAnimationFrame(tick);
  }

  async function playClip(fromStart = true) {
    const a = state.audio;
    if (!a) return;
    cancelAnimationFrame(state.rafId);
    a.pause();
    if (fromStart) a.currentTime = 0;
    state.clipLimit = state.answered ? Infinity : clipSeconds()[state.stage];
    $("play-icon").textContent = "…";
    try {
      await a.play();
      $("play-icon").textContent = "♪";
      state.rafId = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      $("play-icon").textContent = "▶";
      toast("播放失敗，請再按一次");
    }
  }

  function stopAudio() {
    cancelAnimationFrame(state.rafId);
    if (state.audio) {
      state.audio.pause();
      state.audio.removeAttribute("src");
      state.audio.load();
      state.audio = null;
    }
  }

  function listenMore() {
    if (state.answered || state.stage >= clipSeconds().length - 1) return;
    state.stage++;
    renderClipStage();
    updateWorth();
    playClip();
  }

  // ---------- 線索模式 ----------
  function addClue() {
    const clues = state.current.clues;
    const clue = clues[state.stage];
    const li = document.createElement("li");
    if (clue.image) {
      const img = document.createElement("img");
      img.src = clue.image;
      img.alt = "專輯封面";
      li.classList.add("cover");
      li.appendChild(img);
    } else {
      li.textContent = clue;
      if (state.stage === clues.length - 1) li.classList.add("emoji");
    }
    $("clue-list").appendChild(li);
    const last = state.stage >= clues.length - 1;
    $("btn-clue").disabled = last;
    $("btn-clue").textContent = last ? "線索用完了" : "再給一個線索";
  }

  function moreClue() {
    if (state.answered || state.stage >= state.current.clues.length - 1) return;
    state.stage++;
    addClue();
    updateWorth();
  }

  // ---------- 歌詞模式 ----------
  const LYRIC_BUILDERS = {
    lyric: (lyrics, song) => window.Lyrics.guessTitleQuestion(lyrics.lines, song),
    fill: (lyrics) => window.Lyrics.fillQuestion(lyrics.lines),
  };

  // 一首一首去 LRCLIB 找歌詞，找到夠用的就出題，湊滿題數為止
  async function buildLyricQueue(mode) {
    const want = Math.min(state.totalRounds, state.pool.length);
    const candidates = shuffle(state.pool).slice(0, Math.max(want * 3, 12));
    const queue = [];
    let tried = 0;
    let failures = 0;
    let i = 0;
    const worker = async () => {
      while (queue.length < want && i < candidates.length) {
        const song = candidates[i++];
        try {
          const lyrics = await window.Lyrics.fetchLyrics(song, state.artist.name);
          if (lyrics && queue.length < want) {
            const q = LYRIC_BUILDERS[mode](lyrics, song);
            if (q) queue.push({ ...song, lyricQ: q });
          }
        } catch (err) {
          failures++;
          console.warn(err);
        }
        tried++;
        $("loading-text").textContent = `正在翻歌詞本……已找到 ${queue.length} / ${want} 首`;
      }
    };
    $("loading-text").textContent = "正在翻歌詞本……";
    await Promise.all([worker(), worker(), worker()]);

    if (queue.length < Math.min(3, want)) {
      const reason =
        failures && failures === tried
          ? "連不上歌詞資料庫 LRCLIB，請確認網路後再試一次。"
          : `找不到夠多 ${state.artist.name} 的歌詞，換一位歌手或換個模式試試看吧。`;
      $("loading-text").textContent = reason;
      $("btn-loading-clue").classList.add("hidden");
      $("loading-actions").classList.remove("hidden");
      return false;
    }
    if (queue.length < want) toast(`只找到 ${queue.length} 首有歌詞的歌，這局就玩 ${queue.length} 題`);
    state.queue = queue;
    return true;
  }

  const HINT_LABELS = {
    lyric: ["再看一句", "看專輯資訊"],
    fill: ["看上一句", "看下一句"],
  };

  function lyricLine(text, className = "") {
    const p = document.createElement("p");
    p.className = `lyric-line ${className}`.trim();
    p.textContent = text;
    return p;
  }

  function renderLyric({ reveal = false } = {}) {
    const song = state.current;
    const q = song.lyricQ;
    const card = $("lyric-card");
    const mode = state.mode;
    $("lyric-song").textContent = mode === "lyric" ? "這是哪一首歌？" : `〈${song.title}〉`;

    if (mode === "lyric") {
      card.innerHTML = "";
      q.lines.slice(0, state.stage === 0 && !reveal ? 1 : 2).forEach((t) => card.appendChild(lyricLine(t)));
      if (state.stage >= 2 || reveal) {
        const meta = [song.album && `《${song.album}》`, song.year].filter(Boolean).join("・");
        if (meta) card.appendChild(lyricLine(meta, "lyric-meta"));
      }
    } else if (mode === "fill") {
      card.innerHTML = "";
      if (state.stage >= 1 || reveal) card.appendChild(lyricLine(q.prev, "lyric-dim"));
      const line = lyricLine("");
      line.append(q.before);
      const blank = document.createElement("span");
      blank.className = reveal ? "blank filled" : "blank";
      blank.textContent = reveal ? q.answer : "＿".repeat(Math.max(2, Math.min(4, [...q.answer].length)));
      line.append(blank, q.after);
      card.appendChild(line);
      if (state.stage >= 2 || reveal) card.appendChild(lyricLine(q.next, "lyric-dim"));
    }

    const labels = HINT_LABELS[mode];
    const last = state.stage >= labels.length;
    $("btn-hint").textContent = last ? "提示用完了" : labels[state.stage];
    $("btn-hint").disabled = last || reveal;
  }

  function moreHint() {
    if (state.answered || state.stage >= 2) return;
    state.stage++;
    renderLyric();
    updateWorth();
  }

  // ---------- 作答 ----------
  function answer(opt, btn) {
    if (state.answered) return;
    state.answered = true;
    const song = state.current;
    const correctKey = isTextMode(state.mode) ? ANSWER_KEY : song.key;
    const correct = opt.key === correctKey;
    const points = correct ? currentPoints() : 0;
    state.score += points;
    state.history.push({
      title: state.mode === "artist" ? `${byId(song.key).name}〈${song.title}〉` : song.title,
      correct,
      points,
      pick: opt.title,
      artistId: state.mode === "artist" ? song.key : null,
      stage: state.stage,
      seconds: usesAudio(state.mode) ? clipSeconds()[state.stage] : null,
      // 成績圖可以拿這一局出現過的專輯封面當背景
      artwork: song.artwork || null,
      album: song.album || "",
    });

    for (const b of $("options").querySelectorAll(".option")) {
      b.disabled = true;
      if (b.dataset.key === correctKey) b.classList.add("correct");
    }
    if (!correct) btn.classList.add("wrong");

    $("hud-score").textContent = state.score;
    $("btn-more").disabled = true;
    $("btn-clue").disabled = true;
    $("btn-hint").disabled = true;
    if (isLyricMode(state.mode)) renderLyric({ reveal: true });

    $("reveal-verdict").textContent = correct ? `答對了！+${points} 分` : "可惜，答錯了";
    $("reveal-verdict").className = "verdict " + (correct ? "good" : "bad");
    if (state.mode === "artist") {
      $("reveal-title").textContent = byId(song.key).name;
      $("reveal-meta").textContent = [`〈${song.title}〉`, song.year].filter(Boolean).join(" · ");
    } else {
      $("reveal-title").textContent = song.title;
      $("reveal-meta").textContent = [song.album, song.year].filter(Boolean).join(" · ");
    }

    const art = $("reveal-art");
    if (song.artwork) {
      art.src = song.artwork;
      art.classList.remove("hidden");
    } else {
      art.removeAttribute("src");
      art.classList.add("hidden");
    }
    const link = $("reveal-link");
    link.classList.toggle("hidden", !song.link);
    if (song.link) link.href = song.link;

    $("btn-next").textContent = state.round + 1 >= state.totalRounds ? "看結果" : "下一題";
    $("reveal").classList.remove("hidden");
    $("btn-next").focus({ preventScroll: true });
    scrollRevealIntoView();

    // 揭曉後把剩下的試聽播完
    if (usesAudio(state.mode)) playClip(false);
  }

  // 揭曉後把「下一題」捲到看得見的地方。
  // scrollIntoView 只看版面高度，手機 Safari 的網址列、工具列會蓋在上面，
  // 所以改用實際可見的高度（visualViewport）來算，並在按鈕下方多留一段給工具列；
  // 但不會捲過頭，讓揭曉卡片的上緣跑出畫面。
  function scrollRevealIntoView() {
    const reveal = $("reveal");
    const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const rect = reveal.getBoundingClientRect();
    const toolbarRoom = 88;
    const wanted = rect.bottom - (viewHeight - toolbarRoom);
    const delta = Math.min(wanted, rect.top - 12);
    if (delta <= 0) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
  }

  // ---------- 結算 ----------
  function rankTitle(ratio) {
    const ranks = subject().ranks;
    if (ratio >= 0.9) return ranks[0];
    if (ratio >= 0.7) return ranks[1];
    if (ratio >= 0.4) return ranks[2];
    return ranks[3];
  }

  function finish() {
    stopAudio();
    const max = state.totalRounds * 100;
    const correctCount = state.history.filter((h) => h.correct).length;
    const prevBest = readBest(state.mode, state.totalRounds);
    const isRecord = state.score > prevBest;
    if (isRecord) writeBest(state.mode, state.totalRounds, state.score);
    // 猜歌手模式沒有難度，成績圖第三格改放歌單名稱
    const levelInfo = state.mode === "artist" ? { level: state.group.name, levelLabel: "歌單" } : { level: LEVEL_NAMES[selectedLevel()], levelLabel: "難度" };
    state.lastResult = { max, isRecord, rank: rankTitle(state.score / max), ...levelInfo };

    $("progress-bar").style.width = "100%";
    $("result-score").textContent = state.score;
    $("result-max").textContent = `/ ${max}`;
    $("result-title").textContent = rankTitle(state.score / max);
    $("result-sub").textContent =
      `答對 ${correctCount} / ${state.totalRounds} 題` +
      (isRecord ? "・🎉 新紀錄！" : prevBest ? `・最佳紀錄 ${prevBest} 分` : "");

    const list = $("result-list");
    list.innerHTML = "";
    for (const h of state.history) {
      const li = document.createElement("li");
      li.className = h.correct ? "good" : "bad";
      const mark = h.correct ? `+${h.points}` : "✕";
      li.innerHTML = `<span class="rl-title"></span><span class="rl-mark">${mark}</span>`;
      li.querySelector(".rl-title").textContent = h.correct ? h.title : `${h.title}（你選了 ${h.pick}）`;
      if (h.artistId) {
        const play = document.createElement("button");
        play.type = "button";
        play.className = "rl-play";
        play.dataset.id = h.artistId;
        play.textContent = "玩這位";
        play.title = `換成 ${byId(h.artistId).name}，回首頁選模式`;
        li.classList.add("has-play");
        li.appendChild(play);
      }
      list.appendChild(li);
    }
    $("result-hint").classList.toggle("hidden", state.mode !== "artist");
    show("result");
  }

  function shareText() {
    const modeName = MODE_NAMES[state.mode];
    const correctCount = state.history.filter((h) => h.correct).length;
    return `我在 ${window.withName(subject().short, "猜歌王")}（${modeName}）拿到 ${state.score} 分，答對 ${correctCount} / ${state.totalRounds} 題！⚡ 你能贏我嗎？`;
  }

  // 只留網域和路徑：從 IG／FB 點進來會帶 ?fbclid=… 這種追蹤參數，不能跟著分享出去
  const shareUrl = () => `${location.origin}${location.pathname}#${state.artist.id}`;
  let shareFile = null;
  let shareObjectUrl = null;
  // 每次重畫都換一個號碼，舊的、比較慢畫完的那張就不會蓋掉新的
  let shareToken = 0;

  // ---------- 成績圖背景：預設的唱片，或這位歌手的專輯封面 ----------
  const COVER_MAX = 8;
  // iTunes 的封面網址可以直接改尺寸；縮圖用小張，畫成績圖用大張
  const coverUrl = (url, size) => url.replace(/\d+x\d+(bb)?\.(jpg|png|webp)/, `${size}x${size}bb.jpg`);
  const coverImages = new Map();
  // 預設用第一張封面；picked 表示玩家自己點過，之後就不再自動換
  const shareBg = { covers: [], selected: null, picked: false };

  // 這一局出現過的專輯排前面，不夠再從歌手的歌曲清單補熱門專輯
  function coverChoices(extra = []) {
    const seen = new Set();
    const out = [];
    const add = (url, album) => {
      if (!url) return;
      const key = (album || url).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url, album });
    };
    for (const h of state.history) add(h.artwork, h.album);
    if (state.mode !== "artist") {
      const pool = itunesCache.get(state.artist.id) || readSongCache(state.artist) || extra;
      for (const s of [...pool].sort((a, b) => a.rank - b.rank)) add(s.artwork, s.album);
    }
    return out.slice(0, COVER_MAX);
  }

  // 要畫進 canvas 的圖片必須用 crossOrigin 載入，否則 canvas 會被汙染、存不成圖
  function loadImage(url) {
    if (coverImages.has(url)) return coverImages.get(url);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`載不到圖片：${url}`));
      img.src = url;
    });
    promise.catch(() => coverImages.delete(url));
    coverImages.set(url, promise);
    return promise;
  }

  function renderBgChoices() {
    const box = $("share-bgs");
    box.innerHTML = "";
    const options = [{ url: null, album: "唱片" }, ...shareBg.covers];
    for (const c of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bg-thumb";
      btn.dataset.url = c.url || "";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(c.url === shareBg.selected));
      btn.setAttribute("aria-label", c.url ? `用《${c.album}》的封面當背景` : "用唱片當背景");
      btn.title = c.url ? c.album : "唱片";
      if (c.url) {
        const img = document.createElement("img");
        img.alt = "";
        img.crossOrigin = "anonymous";
        img.src = coverUrl(c.url, 200);
        // 載不到（或不允許跨網域使用）的封面就不提供，反正也畫不進成績圖
        img.addEventListener("error", () => dropCover(c.url));
        btn.appendChild(img);
      } else {
        btn.classList.add("bg-vinyl");
      }
      btn.addEventListener("click", () => selectBg(c.url));
      box.appendChild(btn);
    }
    $("share-bg").classList.toggle("hidden", !shareBg.covers.length);
  }

  function markSelected() {
    for (const b of $("share-bgs").children) b.setAttribute("aria-checked", String(b.dataset.url === (shareBg.selected || "")));
  }

  function selectBg(url) {
    shareBg.picked = true;
    if (url === shareBg.selected) return;
    shareBg.selected = url;
    markSelected();
    renderShare();
  }

  // 沒選過背景時，自動用第一張封面；沒有封面就用唱片
  function selectDefaultBg() {
    if (shareBg.picked) return false;
    const next = shareBg.covers[0]?.url || null;
    if (next === shareBg.selected) return false;
    shareBg.selected = next;
    markSelected();
    return true;
  }

  // 載不到的封面拿掉；拿掉的剛好是自動選的那張，就換下一張
  function dropCover(url) {
    shareBg.covers = shareBg.covers.filter((x) => x.url !== url);
    $("share-bgs").querySelector(`[data-url="${CSS.escape(url)}"]`)?.remove();
    $("share-bg").classList.toggle("hidden", !shareBg.covers.length);
    if (shareBg.selected === url && selectDefaultBg()) renderShare();
  }

  // 只用到手寫題庫、沒抓過 iTunes 的話，背景候選會是空的；背景再查一次熱門歌補封面
  async function fillCoversLater() {
    if (state.mode === "artist" || shareBg.covers.length >= 3) return;
    try {
      const songs = await quickSongs(state.artist);
      if (!$("share-dialog").open) return;
      shareBg.covers = coverChoices(songs);
      renderBgChoices();
      if (selectDefaultBg()) renderShare();
    } catch {
      /* 查不到就只有唱片背景 */
    }
  }

  // 打開預覽視窗，當場把成績畫成限動尺寸的圖
  function share() {
    shareBg.covers = coverChoices();
    shareBg.picked = false;
    shareBg.selected = shareBg.covers[0]?.url || null;
    $("share-img").classList.add("hidden");
    renderBgChoices();
    $("share-dialog").showModal();
    renderShare();
    fillCoversLater();
  }

  async function renderShare() {
    const token = ++shareToken;
    const img = $("share-img");
    shareFile = null;
    // 換背景時先留著上一張、淡一點，畫好再換掉，不會整個閃一下
    const first = img.classList.contains("hidden");
    if (first) {
      $("share-loading").textContent = "正在畫成績圖……";
      $("share-loading").classList.remove("hidden");
    }
    $("share-preview").classList.add("busy");
    $("btn-share-image").disabled = true;
    $("btn-download").removeAttribute("href");

    // 載圖途中選擇可能被換掉，先記下這次要畫哪一張
    const url = shareBg.selected;
    let cover = null;
    if (url) {
      try {
        cover = await loadImage(coverUrl(url, 1000));
      } catch {
        // 大張載不到就退回縮圖那張，再不行就用唱片
        cover = await loadImage(coverUrl(url, 200)).catch(() => null);
        if (!cover && token === shareToken) {
          // 自動選的封面載不到就默默換下一張；玩家自己點的才提示
          if (!shareBg.picked) return dropCover(url);
          toast("這張封面載不下來，先用唱片背景");
        }
      }
      if (token !== shareToken) return;
    }

    try {
      const canvas = await window.ShareCard.render({
        artist: subject(),
        mode: state.mode,
        modeName: MODE_NAMES[state.mode],
        levelName: state.lastResult.level,
        levelLabel: state.lastResult.levelLabel,
        score: state.score,
        max: state.lastResult.max,
        rank: state.lastResult.rank,
        isRecord: state.lastResult.isRecord,
        history: state.history,
        url: shareUrl().replace(/^https?:\/\//, ""),
        cover,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (token !== shareToken) return;
      if (!blob) throw new Error("成績圖轉不成圖片");
      const name = `${subject().id}-${state.score}.png`;
      shareFile = new File([blob], name, { type: "image/png" });
      if (shareObjectUrl) URL.revokeObjectURL(shareObjectUrl);
      shareObjectUrl = URL.createObjectURL(blob);
      img.src = shareObjectUrl;
      img.classList.remove("hidden");
      $("share-loading").classList.add("hidden");
      $("share-preview").classList.remove("busy");
      $("btn-download").href = shareObjectUrl;
      $("btn-download").download = name;

      // 不支援分享檔案的瀏覽器（多半是電腦）就只留下載
      const canShareFile = Boolean(navigator.canShare && navigator.canShare({ files: [shareFile] }));
      $("btn-share-image").classList.toggle("hidden", !canShareFile);
      $("btn-share-image").disabled = !canShareFile;
      $("share-hint").textContent = canShareFile
        ? "分享時會自動複製網址，在限動加「連結」貼圖貼上，蓋在虛線框上。"
        : "下載時會自動複製網址，上傳限動後加「連結」貼圖貼上，蓋在虛線框上。";
    } catch (err) {
      console.error(err);
      if (token !== shareToken) return;
      img.classList.add("hidden");
      $("share-preview").classList.remove("busy");
      $("share-loading").textContent = "成績圖畫不出來，先用「複製文字」分享吧。";
      $("share-loading").classList.remove("hidden");
    }
  }

  // 分享或下載時順便把網址複製起來，到 IG 加「連結」貼圖直接貼上，蓋在成績圖的虛線框。
  // 先用同步的 execCommand 當場寫進剪貼簿：分享選單一跳出來網頁就失去焦點，
  // 非同步的 clipboard API 常常還沒寫完就被擋掉。不行再退回 clipboard API。
  function copyShareUrl() {
    const url = shareUrl();
    // 分享視窗是 modal，外面的元素選不到，暫存的輸入框要放在視窗裡
    const host = $("share-dialog").open ? $("share-dialog") : document.body;
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.readOnly = true; // 不跳鍵盤
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;pointer-events:none";
    const prev = document.activeElement;
    host.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, url.length); // iOS 只認這個
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* 不支援就交給 clipboard API */
    }
    ta.remove();
    prev?.focus?.({ preventScroll: true });
    if (ok) return Promise.resolve(true);
    if (!navigator.clipboard) return Promise.resolve(false);
    return navigator.clipboard.writeText(url).then(
      () => true,
      () => false,
    );
  }

  const LINK_TIP = "網址已複製，在限動加「連結」貼圖貼上，蓋在虛線框上";

  async function shareImage() {
    if (!shareFile) return;
    // 一定要先複製再叫出分享選單，兩件事都得在點擊當下做
    const copied = copyShareUrl();
    try {
      await navigator.share({ files: [shareFile], text: `${shareText()}\n${shareUrl()}` });
    } catch (err) {
      if (err && err.name !== "AbortError") return toast("分享失敗，改用下載圖片試試");
    }
    if (await copied) toast(LINK_TIP);
  }

  async function downloadImage() {
    if (await copyShareUrl()) toast(LINK_TIP);
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(`${shareText()}\n${shareUrl()}`);
      toast("已複製到剪貼簿");
    } catch {
      toast("複製失敗");
    }
  }

  function quit() {
    stopAudio();
    // 猜歌手模式用的是歌單的配色，回首頁換回目前歌手的
    applyTheme(state.artist.colors);
    renderBest();
    show("home");
  }

  // ---------- 猜歌手 ----------
  const quickCache = new Map();

  async function quickSongs(artist) {
    if (quickCache.has(artist.id)) return quickCache.get(artist.id);
    // 之前玩過這位歌手、已經有完整曲目的話直接用
    const songs = itunesCache.get(artist.id) || readSongCache(artist) || (await window.ITunes.fetchQuick(artist));
    quickCache.set(artist.id, songs);
    return songs;
  }

  // 從歌單裡挑歌手，每位抓一首比較熱門的歌
  async function buildArtistQueue() {
    const group = state.group;
    show("loading");
    $("loading-actions").classList.add("hidden");
    $("btn-loading-clue").classList.add("hidden");
    const want = state.totalRounds;
    // 歌單夠大就每題不同歌手；歌手比題數少時才會重複
    let order = shuffle(group.artists);
    while (order.length < want * 2) order = order.concat(shuffle(group.artists));
    const queue = [];
    const usedSongs = new Set();
    let failures = 0;
    let tried = 0;
    let i = 0;
    const worker = async () => {
      while (queue.length < want && i < order.length && tried < want * 3) {
        const artist = byId(order[i++]);
        tried++;
        try {
          const songs = (await quickSongs(artist)).filter((x) => !usedSongs.has(`${artist.id}:${x.key}`));
          if (!songs.length) continue;
          const popular = songs.filter((x) => x.rank < 15);
          const song = pick(popular.length ? popular : songs);
          usedSongs.add(`${artist.id}:${song.key}`);
          if (queue.length < want) queue.push({ ...song, key: artist.id });
        } catch (err) {
          failures++;
          console.warn(err);
        }
        $("loading-text").textContent = `正在挑歌……${queue.length} / ${want}`;
      }
    };
    $("loading-text").textContent = `正在從「${group.name}」挑歌……`;
    await Promise.all([worker(), worker()]);

    if (queue.length < Math.min(3, want)) {
      $("loading-text").textContent =
        failures >= tried / 2
          ? "連不上 iTunes，抓不到歌曲。iTunes 每分鐘能查的次數有限，等一分鐘再試試看。"
          : `「${group.name}」裡找得到歌的歌手太少了，換一個歌單試試看吧。`;
      $("loading-actions").classList.remove("hidden");
      return false;
    }
    if (queue.length < want) toast(`只挑到 ${queue.length} 首，這局就玩 ${queue.length} 題`);
    state.queue = queue;
    state.pool = queue;
    return true;
  }

  function openGroupPicker() {
    const box = $("group-list");
    box.innerHTML = "";
    const rounds = selectedRounds();
    for (const group of window.GROUPS) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "artist-row group-row";
      const best = Number(storageGet(bestKey("artist", rounds, group.subject.id))) || 0;
      const sample = group.artists
        .slice(0, 4)
        .map((id) => byId(id).name)
        .join("、");
      row.innerHTML = `
        <span class="avatar group-avatar" aria-hidden="true"></span>
        <span class="row-text"><span class="row-name"></span><span class="row-sub"></span></span>
        <span class="row-best"></span>`;
      const avatar = row.querySelector(".avatar");
      avatar.textContent = group.icon;
      avatar.style.background = `linear-gradient(135deg, ${group.colors.accent}, ${group.colors.accent2})`;
      row.querySelector(".row-name").textContent = `${group.name}・${group.artists.length} 位`;
      row.querySelector(".row-sub").textContent = group.id === "mix" ? group.desc : `${sample}……`;
      row.querySelector(".row-best").textContent = best ? `最佳 ${best}` : "";
      row.title = group.desc;
      row.addEventListener("click", () => {
        $("group-dialog").close();
        state.group = group;
        startGame("artist");
      });
      box.appendChild(row);
    }
    $("group-dialog").showModal();
  }

  // ---------- 事件 ----------
  for (const card of document.querySelectorAll(".mode-card[data-mode]")) {
    card.addEventListener("click", () => startGame(card.dataset.mode));
  }
  $("btn-guess-artist").addEventListener("click", openGroupPicker);
  $("group-close").addEventListener("click", () => $("group-dialog").close());
  $("group-dialog").addEventListener("click", (e) => {
    if (e.target === $("group-dialog")) $("group-dialog").close();
  });
  for (const r of document.querySelectorAll('input[name="rounds"], input[name="level"]')) {
    r.addEventListener("change", renderBest);
  }
  $("btn-play").addEventListener("click", () => playClip(!state.answered));
  $("btn-more").addEventListener("click", listenMore);
  $("btn-clue").addEventListener("click", moreClue);
  $("btn-hint").addEventListener("click", moreHint);
  $("btn-next").addEventListener("click", () => {
    state.round++;
    nextRound();
  });
  $("btn-quit").addEventListener("click", quit);
  $("btn-again").addEventListener("click", () => startGame(state.mode));
  $("btn-home").addEventListener("click", quit);
  $("btn-share").addEventListener("click", share);
  $("btn-share-image").addEventListener("click", shareImage);
  $("btn-download").addEventListener("click", downloadImage);
  $("btn-copy").addEventListener("click", copyShareText);
  $("share-close").addEventListener("click", () => $("share-dialog").close());
  $("share-dialog").addEventListener("click", (e) => {
    if (e.target === $("share-dialog")) $("share-dialog").close();
  });
  $("btn-loading-back").addEventListener("click", quit);
  $("result-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".rl-play");
    if (!btn) return;
    quit();
    choose(btn.dataset.id);
    toast(`換成 ${state.artist.name} 了，選個模式開始吧`);
  });
  $("btn-loading-clue").addEventListener("click", () => startGame("clue"));
  $("reveal-art").addEventListener("error", (e) => e.target.classList.add("hidden"));

  document.addEventListener("keydown", (e) => {
    if (!$("screen-play").classList.contains("active") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key) && !state.answered) {
      const btn = $("options").querySelectorAll(".option")[Number(e.key) - 1];
      if (btn) btn.click();
    } else if (e.key === " " && e.target === document.body && usesAudio(state.mode)) {
      e.preventDefault();
      playClip(!state.answered);
    }
  });

  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id && id !== state.artist.id && window.ARTISTS.some((a) => a.id === id)) {
      quit();
      selectArtist(id);
    }
  });

  setupPicker();
  const initial = location.hash.slice(1) || storageGet("guess-artist");
  selectArtist(initial, { remember: false });
})();
