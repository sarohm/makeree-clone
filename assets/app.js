/* Local clone of the Makeree "makeree" guides app. Reads data/ and media/ saved by the crawler. */
(function () {
  "use strict";
  const $app = document.getElementById("app");
  const $overlay = document.getElementById("overlay");
  const $lang = document.getElementById("lang");
  const $back = document.getElementById("back");
  const state = { app: null, manifest: {}, sections: {}, projects: {}, lang: localStorage.getItem("lang") || "eng" };
  const LANG_DIR = { heb: "rtl" };

  const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const media = (u) => (u ? (state.manifest[u] ? encodeURI(state.manifest[u]) : u) : "");
  const isVideo = (u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u || "");
  const isImage = (u) => /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(u || "");
  const ytId = (u) => { const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(u || ""); return m && m[1]; };

  function theme(settings) {
    const t = {};
    (settings || []).forEach((s) => (t[s.property] = s.value));
    const r = document.documentElement.style;
    const map = {
      defaultBackgroundColor: "--bg", defaultTextColor: "--text", defaultIconsColor: "--icons",
      buttonBackgroundColor: "--accent", buttonTextColor: "--accent-text", stepBackgroundColor: "--step-bg",
      stepTextBackgroundColor: "--step-text-bg", textStepBackgroundColor: "--text-step-bg", textStepTextColor: "--text-step-text",
      splitDecisionBackgroundColor: "--muted",
    };
    Object.entries(map).forEach(([k, v]) => t[k] && r.setProperty(v, t[k]));
    if (t.stepTextContentPercentage) r.setProperty("--text-pct", t.stepTextContentPercentage + "%");
    return t;
  }

  async function boot() {
    const [app, manifest] = await Promise.all([j("data/app.json"), j("media-manifest.json")]);
    state.app = app;
    state.manifest = manifest || {};
    state.theme = theme(app.application.themeSettings);
    document.getElementById("logo").src = "assets/forreal-logo.svg";
    app.application.languages.forEach((l) => $lang.insertAdjacentHTML("beforeend", `<option value="${l.languageCode}">${esc(l.languageName)}</option>`));
    $lang.value = state.lang;
    $lang.onchange = () => { state.lang = $lang.value; localStorage.setItem("lang", state.lang); route(); };
    window.addEventListener("hashchange", route);
    route();
  }

  async function section(id) {
    if (!(id in state.sections)) state.sections[id] = await j(`data/sections/${id}.json`);
    return state.sections[id];
  }
  async function project(id) {
    const key = id + "/" + state.lang;
    if (!(key in state.projects)) state.projects[key] = (await j(`data/projects/${id}/${state.lang}.json`)) || (await j(`data/projects/${id}/_default.json`));
    return state.projects[key];
  }

  function route() {
    closeOverlay();
    window.scrollTo(0, 0);
    document.onkeydown = null;
    document.documentElement.dir = LANG_DIR[state.lang] || "ltr";
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "section") return renderSection(parts[1]);
    if (parts[0] === "folder") return renderFolder(parts[1]);
    if (parts[0] === "gallery") return renderGallery(parts[1], parts[2]);
    if (parts[0] === "guide") return renderGuide(parts[1], parts[2]);
    renderHome();
  }

  function setBack(href, label) { $back.hidden = !href; if (href) { $back.href = href; $back.querySelector("span").textContent = label; } }

  const card = (href, img, title, meta) =>
    `<a class="card" href="${href}"><div class="thumb" style="background-image:url('${esc(media(img))}')"></div><div class="body"><h3>${esc(title)}</h3>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}</div></a>`;

  function hero(img, title, sub, kicker) {
    return `<section class="hero" style="background-image:url('${esc(media(img))}')">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</section>`;
  }

  function menuCard(m) {
    const n = m.itemsNumber ? `${m.itemsNumber} projects` : "";
    if (m.type === 0) return card(`#/folder/${m.data || m.id}`, m.imageUrl, m.title, "Collection");
    return card(`#/section/${m.data}`, m.imageUrl, m.title, n);
  }

  function renderHome() {
    setBack(null); // home has no back link (the original pointed to makeree.com)
    const a = state.app.application, nav = state.app.navigation;
    const shown = new Set(nav.mainMenu.menuItems.map((m) => m.data));
    nav.navItems.filter((n) => !n.parent).forEach((n) => { if (shown.has(n.id)) shown.add(n.data); });
    const extra = nav.navItems.filter((n) => !n.parent && n.data && !shown.has(n.data) && !shown.has(n.id));
    $app.innerHTML =
      hero(a.mainImage, a.mainTitle.replace(/\b\w/g, (c) => c.toUpperCase()), a.mainSubtitle) +
      `<div class="search"><input id="q" placeholder="${esc(a.placeholderSearch || "Search for product/guide")}"></div>` +
      `<div id="results"></div>` +
      `<p class="gallery-link"><a class="btn secondary" href="#/gallery">${esc(state.theme.customGalleryTitle || "Gallery")}</a></p>` +
      `<div class="grid">${nav.mainMenu.menuItems.map(menuCard).join("")}</div>` +
      (extra.length ? `<h2 class="section-title">More</h2><div class="grid">${extra.map((n) => card(`#/section/${n.data}`, n.imageUrl, n.title, n.itemsNumber + " projects")).join("")}</div>` : "");
    document.getElementById("q").oninput = (e) => search(e.target.value);
  }

  let allGuides = null;
  async function search(q) {
    const $r = document.getElementById("results");
    q = q.trim().toLowerCase();
    if (!q) { $r.innerHTML = ""; return; }
    if (!allGuides) {
      const ids = new Set(state.app.navigation.navItems.map((n) => n.data).concat(state.app.navigation.mainMenu.menuItems.map((m) => m.data)).filter(Boolean));
      const secs = await Promise.all([...ids].map(section));
      const seen = new Set();
      allGuides = [];
      secs.filter(Boolean).forEach((s) => s.guides.forEach((g) => { if (!seen.has(g.projectId)) { seen.add(g.projectId); allGuides.push(g); } }));
    }
    const hits = allGuides.filter((g) => g.projectName.toLowerCase().includes(q));
    $r.innerHTML = `<div class="grid">${hits.map((g) => card(`#/guide/${g.projectId}`, g.imageUrl, g.projectName)).join("") || '<div class="empty">No guides found</div>'}</div>`;
  }

  function renderFolder(id) {
    setBack("#/", "Home");
    const nav = state.app.navigation;
    const self = nav.navItems.find((n) => n.id === id) || nav.mainMenu.menuItems.find((m) => m.data === id) || { title: "" };
    const kids = nav.navItems.filter((n) => n.parent === id);
    $app.innerHTML = hero(self.imageUrl, self.title) +
      (kids.length ? `<div class="grid">${kids.map((n) => card(`#/section/${n.data}`, n.imageUrl, n.title, n.itemsNumber + " projects")).join("")}</div>` : '<div class="empty">Nothing here yet</div>');
  }

  const fmtTime = (t) => { if (!t || t === "00:00:00") return ""; const [h, m] = t.split(":").map(Number); return (h ? h + "h " : "") + (m ? m + " min" : ""); };

  async function renderSection(id) {
    setBack("#/", "Home");
    $app.innerHTML = '<div class="loading">Loading…</div>';
    const s = await section(id);
    if (!s) { $app.innerHTML = '<div class="empty">Section not found</div>'; return; }
    const gcount = (await gallery()).filter((g) => g.sections.includes(id)).length;
    $app.innerHTML = hero(s.sectionImageUrl, s.sectionName) +
      (gcount ? `<p class="gallery-link"><a class="btn secondary" href="#/gallery/section/${id}">${esc(state.theme.customGalleryTitle || "Gallery")} (${gcount})</a></p>` : "") +
      `<div class="grid">${s.guides.map((g, i) => card(`#/guide/${g.projectId}`, g.imageUrl, g.projectName, [s.isMultipart ? `Part ${i + 1}` : "", fmtTime(g.time)].filter(Boolean).join(" · "))).join("")}</div>`;
    state.lastSection = id;
  }

  /* ---------- shared images gallery ---------- */
  let galleryData = null;
  async function gallery() {
    if (!galleryData) galleryData = (await j("data/gallery.json")) || [];
    return galleryData;
  }

  async function renderGallery(kind, id) {
    const title = state.theme.customGalleryTitle || "Gallery";
    let items = await gallery(), sub = "";
    if (kind === "section") {
      items = items.filter((g) => g.sections.includes(id));
      const s = await section(id); sub = s ? s.sectionName : "";
      setBack(`#/section/${id}`, "Back");
    } else if (kind === "guide") {
      items = items.filter((g) => g.lessons.includes(id));
      sub = items[0] ? items[0].projectName : "";
      setBack(`#/guide/${id}`, "Back");
    } else setBack("#/", "Home");
    $app.innerHTML = hero(state.app.application.mainImage, title, sub || `${items.length} photos and videos shared by makers`) +
      `<div class="gallery">${items.map((g, i) => `<button class="gitem" data-g="${i}">
        <img loading="lazy" src="${esc(media(g.thumbUrl || g.url))}" alt="">${g.isVideo ? '<span class="play">&#9654;</span>' : ""}
        <span class="cap">${esc(g.projectName)}</span></button>`).join("") || '<div class="empty">No shared images yet</div>'}</div>`;
    $app.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => {
      const g = items[+b.dataset.g];
      $overlay.innerHTML = `<div class="box"><button class="close" aria-label="Close">&times;</button>
        ${g.isVideo ? `<video src="${esc(media(g.url))}" controls autoplay playsinline></video>` : `<img src="${esc(media(g.url))}" alt="">`}
        <p><a href="#/guide/${g.projectId}">${esc(g.projectName)}</a> · ♥ ${g.reaction1Count || 0} · ★ ${g.reaction2Count || 0}</p></div>`;
      $overlay.hidden = false;
      $overlay.onclick = (e) => { if (e.target === $overlay || e.target.classList.contains("close")) closeOverlay(); };
    }));
  }

  /* ---------- guide player ---------- */
  async function renderGuide(id, stepArg) {
    setBack(state.lastSection ? `#/section/${state.lastSection}` : "#/", "Back");
    $app.innerHTML = '<div class="loading">Loading…</div>';
    const p = await project(id);
    if (!p) { $app.innerHTML = '<div class="empty">Guide not found</div>'; return; }
    theme(p.themeSettings);
    document.title = `Makeree - ${p.name}`;

    // screens: intro, materials, steps..., finish
    const screens = [];
    if (!p.hideIntroductionScreen) screens.push({ kind: "intro" });
    if ((p.materials || []).length) screens.push({ kind: "materials" });
    p.lessonSteps.forEach((s) => screens.push({ kind: "step", s }));
    screens.push({ kind: "finish" });
    const firstStep = screens.findIndex((x) => x.kind === "step");
    let idx = Math.max(0, Math.min(screens.length - 1, parseInt(stepArg || "0", 10) || 0));

    const kicker = p.partNumber > 0 ? `Part ${p.partNumber}` : "";
    const gcount = (await gallery()).filter((g) => g.lessons.includes(id)).length;
    $app.innerHTML = `<div class="guide">${hero(p.sectionImageUrl || p.infoImageUrl, p.name, "", kicker)}
      <div class="stage" id="stage"></div>
      <div class="progress"><div id="bar"></div></div>
      <div class="steps-menu"><details><summary>All steps (${p.lessonSteps.length})</summary><ol id="list"></ol></details></div>
      <button class="nav-arrow prev" id="prev" aria-label="Previous">&larr;</button>
      <button class="nav-arrow next" id="next" aria-label="Next">&rarr;</button></div>`;

    document.getElementById("list").innerHTML = p.lessonSteps
      .map((s, i) => `<li data-i="${screens.findIndex((x) => x.s === s)}">${esc(stepLabel(s, i, p))}</li>`).join("");
    document.getElementById("list").onclick = (e) => { const li = e.target.closest("li"); if (li) go(+li.dataset.i); };
    document.getElementById("prev").onclick = () => go(idx - 1);
    document.getElementById("next").onclick = () => go(idx + 1);
    document.onkeydown = (e) => {
      if (!$overlay.hidden) { if (e.key === "Escape") closeOverlay(); return; }
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    };

    function go(i) {
      if (i < 0 || i >= screens.length) return;
      idx = i;
      history.replaceState(null, "", `#/guide/${id}/${i}`);
      draw();
    }
    function goGroup(groupId) {
      const i = screens.findIndex((x) => x.s && x.s.stepGroupId === groupId);
      if (i >= 0) go(i);
    }

    function draw() {
      const sc = screens[idx];
      const $s = document.getElementById("stage");
      $s.className = "stage";
      document.getElementById("prev").disabled = idx === 0;
      document.getElementById("next").disabled = idx === screens.length - 1;
      document.getElementById("bar").style.width = (100 * (idx + 1)) / screens.length + "%";
      document.querySelectorAll("#list li").forEach((li) => li.classList.toggle("current", +li.dataset.i === idx));

      if (sc.kind === "intro") {
        $s.innerHTML = `<div class="text"><h2>${esc(p.name)}</h2>${p.subTitle ? `<h4>${esc(p.subTitle)}</h4>` : ""}
          <p>${esc(p.description)}</p>${fmtTime(p.timeToMake) ? `<p><b>Time:</b> ${fmtTime(p.timeToMake)}</p>` : ""}
          <button class="btn" id="start">${esc(p.startButtonTitle || "Get started")} &rarr;</button></div>
          <div class="media">${mediaHtml(p.infoImageUrl)}</div>`;
        $s.style.flexDirection = "";
        document.getElementById("start").onclick = () => go(idx + 1);
      } else if (sc.kind === "materials") {
        const groups = { 1: "Materials", 2: "Tools" };
        const by = {};
        p.materials.forEach((m) => (by[m.type] = by[m.type] || []).push(m));
        $s.innerHTML = `<div class="media">${mediaHtml(p.materialsImageUrl || p.infoImageUrl)}</div>
          <div class="text materials"><h2>${esc(p.materialsText || "Materials")}</h2>
          ${Object.entries(by).map(([t, list]) => `${Object.keys(by).length > 1 ? `<div class="kind">${groups[t] || ""}</div>` : ""}<ul>${list.map((m) =>
            `<li>${m.imageUrl ? `<img class="mat-img" src="${esc(media(m.imageUrl))}" alt="">` : ""}<b>${m.quantity} x</b>${esc(m.name)}</li>`).join("")}</ul>`).join("")}</div>`;
      } else if (sc.kind === "finish") {
        $s.innerHTML = `<div class="media">${mediaHtml(p.finishImageUrl || p.infoImageUrl)}</div>
          <div class="text"><h2>${esc(p.finishTitle || "Well done!")}</h2><p>${esc(p.finishText || "")}</p>
          ${p.nextProjectId ? `<p>Next:</p><a class="card" href="#/guide/${p.nextProjectId}"><div class="thumb" style="background-image:url('${esc(media(p.nextProjectImageUrl))}')"></div><div class="body"><h3>${esc(p.nextProjectName)}</h3></div></a>` : ""}
          <p><button class="btn secondary" id="again">Start over</button>
          ${gcount ? ` <a class="btn secondary" href="#/gallery/guide/${id}">${esc(state.theme.customGalleryTitle || "Gallery")} (${gcount})</a>` : ""}</p></div>`;
        document.getElementById("again").onclick = () => go(0);
      } else {
        const s = sc.s, n = p.lessonSteps.indexOf(s) + 1;
        const textOnly = !s.url && !(s.tips || []).length;
        if (textOnly) $s.classList.add("textonly");
        const q = s.extraData && s.extraData.extraDataQuestion;
        $s.innerHTML = `<div class="media">${mediaHtml(s.url, s)}</div>
          <div class="text">${s.stepGroup ? `<h4>${esc(s.stepGroup)}</h4>` : ""}
          ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}<p>${esc(s.text)}</p>
          ${(s.contentTips || []).length ? `<div class="content-tips">${s.contentTips.map((t, i) => `<button class="btn secondary" data-ct="${i}">${esc(t.title || "Tip")}</button>`).join("")}</div>` : ""}
          ${q && !q.hideQuestion ? `<div class="question"><b>${esc(q.text)}</b><div class="opts">${q.data.map((o, i) => `<button class="btn" data-q="${i}">${esc(o.text)}</button>`).join("")}</div></div>` : ""}
          <div class="stepcount">${n} / ${p.lessonSteps.length}</div></div>`;
        $s.querySelectorAll("[data-tip]").forEach((b) => (b.onclick = () => openTip(s.tips[+b.dataset.tip])));
        $s.querySelectorAll("[data-ct]").forEach((b) => (b.onclick = () => openTip(s.contentTips[+b.dataset.ct])));
        $s.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
          const o = q.data[+b.dataset.q];
          if (o.projectId) location.hash = `#/guide/${o.projectId}`;
          else if (o.url) window.open(o.url, "_blank");
          else if (o.sectionId) goGroup(o.sectionId);
          else go(idx + 1);
        }));
      }
    }
    if (idx === 0 && stepArg === undefined && firstStep < 0) idx = 0;
    draw();
  }

  function stepLabel(s, i, p) {
    const t = s.title || s.text || "";
    return p.hideStepTitles || !t ? `Step ${i + 1}` : t.length > 70 ? t.slice(0, 70) + "…" : t;
  }

  function mediaHtml(url, step) {
    if (!url) return "";
    const tips = step && step.tips && step.tips.length
      ? step.tips.map((t, i) => `<button class="tip" data-tip="${i}" style="left:${(t.x / 1024) * 100}%;top:${(t.y / 768) * 100}%${t.width ? `;width:${(t.width / 1024) * 100}%;height:auto` : ""}"><img src="${esc(media(t.imageUrl))}" alt="tip"></button>`).join("")
      : "";
    const yt = ytId(url);
    let inner;
    if (yt) inner = `<iframe src="https://www.youtube.com/embed/${yt}" allowfullscreen></iframe>`;
    else if (isVideo(url)) inner = `<video src="${esc(media(url))}" controls playsinline ${step && step.autoPlay ? "autoplay" : ""} ${step && step.muted ? "muted" : ""} loop></video>`;
    else if (isImage(url)) inner = `<img src="${esc(media(url))}" alt="">`;
    else inner = `<iframe src="${esc(url)}" loading="lazy"></iframe>`;
    if (!tips) return inner;
    return `<div class="imgwrap" style="aspect-ratio:4/3;width:100%">${inner.replace("<img ", '<img style="width:100%;height:100%;object-fit:fill" ')}${tips}</div>`;
  }

  function openTip(t) {
    const d = t.data || {};
    let html = "";
    if (d.text) html += `<p>${esc(d.text)}</p>`;
    if (d.items) html += d.items.map((it) => `<div class="tipitem">${mediaHtml(it.url)}<p>${esc(it.text)}</p></div>`).join("");
    if (d.url) {
      if (isVideo(d.url) || isImage(d.url) || ytId(d.url)) html += mediaHtml(d.url);
      else html += `<p><a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">Open link</a></p>`;
    }
    $overlay.innerHTML = `<div class="box"><button class="close" aria-label="Close">&times;</button>${t.title ? `<h3>${esc(t.title)}</h3>` : ""}${html || "<p>(empty tip)</p>"}</div>`;
    $overlay.hidden = false;
    $overlay.onclick = (e) => { if (e.target === $overlay || e.target.classList.contains("close")) closeOverlay(); };
  }
  function closeOverlay() { $overlay.hidden = true; $overlay.innerHTML = ""; }

  boot().catch((e) => { $app.innerHTML = `<div class="empty">Failed to load: ${esc(e.message)}</div>`; });
})();
