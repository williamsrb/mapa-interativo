const SVG_URL = "./mapa-es.svg";
const DATA_URL = "./voluntarios_es_teste.json";

const FILTER_DEBOUNCE_MS = 300;
/** Filtro só roda com pelo menos 3 caracteres (após trim). */
const FILTER_MIN_LENGTH = 3;

const statusEl = document.getElementById("status");
const svgHost = document.getElementById("svg-root");
const panelTitleEl = document.getElementById("municipio-panel-title");
const panelContentEl = document.getElementById("municipio-panel-content");
const tooltip = document.getElementById("tooltip");
const tooltipMunicipio = tooltip.querySelector(".municipio");
const tooltipCount = tooltip.querySelector(".count");

const setStatus = (msg, isError = false) => {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
};

/** @param {string} cidade */
const normalizeKey = (cidade) => cidade.trim().normalize("NFC").toLowerCase();

/** @param {unknown} value */
const collectSearchableText = (value) => {
  const parts = [];
  const walk = (v) => {
    if (v == null) return;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      parts.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (t === "object") {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(value);
  return parts.join(" ").toLowerCase();
};

/**
 * @param {unknown} row
 * @param {string} qLower trimmed, lowercased needle
 */
const volunteerMatchesQuery = (row, qLower) => {
  if (!row || typeof row !== "object") return false;
  return collectSearchableText(row).includes(qLower);
};

/** @returns {string} */
const readFilterFromHash = () => {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/** @param {unknown} data */
const buildCountsByCity = (data) => {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const row of data) {
    if (!row || typeof row.cidade !== "string") continue;
    const key = normalizeKey(row.cidade);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

/**
 * @param {unknown} data
 * @returns {Map<string, Array<{ nome?: string; telefone?: string; habilidades_tecnicas?: string[] }>>}
 */
const buildVolunteersByCity = (data) => {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const row of data) {
    if (!row || typeof row.cidade !== "string") continue;
    const key = normalizeKey(row.cidade);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

/**
 * @param {string} nomeMunicipio
 * @param {Map<string, Array<{ nome?: string; telefone?: string; habilidades_tecnicas?: string[] }>>} byCity
 */
const renderVolunteerPanel = (nomeMunicipio, byCity) => {
  panelTitleEl.textContent = nomeMunicipio;
  const key = normalizeKey(nomeMunicipio);
  const list = byCity.get(key) ?? [];
  panelContentEl.replaceChildren();

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "municipio-panel-empty";
    p.textContent =
      "Nenhum voluntário neste arquivo para este município.";
    panelContentEl.appendChild(p);
    return;
  }

  const sorted = [...list].sort((a, b) =>
    String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR")
  );

  const frag = document.createDocumentFragment();
  for (const v of sorted) {
    const card = document.createElement("article");
    card.className = "voluntario-card";

    const h3 = document.createElement("h3");
    h3.textContent = v.nome ?? "—";

    const tel = document.createElement("p");
    tel.className = "voluntario-tel";
    tel.textContent = v.telefone ?? "—";

    const skills = document.createElement("ul");
    skills.className = "voluntario-skills";
    if (Array.isArray(v.habilidades_tecnicas)) {
      for (const s of v.habilidades_tecnicas) {
        const li = document.createElement("li");
        li.textContent = s;
        skills.appendChild(li);
      }
    }

    card.append(h3, tel, skills);
    frag.appendChild(card);
  }
  panelContentEl.appendChild(frag);
};

/** @param {SVGSVGElement} svg */
const clearMunicipioActiveClass = (svg) => {
  svg.querySelectorAll("g[nome].municipio-active").forEach((el) => {
    el.classList.remove("municipio-active");
  });
};

/** @param {string} nomeMunicipio */
const countForMunicipio = (counts, nomeMunicipio) => {
  const key = normalizeKey(nomeMunicipio);
  return counts.get(key) ?? 0;
};

/** @param {number} n */
const voluntariosLabel = (n) => {
  if (n === 0) return "Nenhum voluntário neste arquivo";
  if (n === 1) return "1 voluntário";
  return `${n} voluntários`;
};

/** @param {number} n */
const correspondenciasLabel = (n) => {
  if (n === 0) return "Nenhuma correspondência";
  if (n === 1) return "1 correspondência";
  return `${n} correspondências`;
};

const main = async () => {
  setStatus("Carregando mapa e dados…");
  let svgText;
  let jsonData;
  try {
    const [svgRes, dataRes] = await Promise.all([
      fetch(SVG_URL),
      fetch(DATA_URL),
    ]);
    if (!svgRes.ok) throw new Error(`SVG: ${svgRes.status}`);
    if (!dataRes.ok) throw new Error(`JSON: ${dataRes.status}`);
    svgText = await svgRes.text();
    jsonData = await dataRes.json();
  } catch (err) {
    console.error(err);
    setStatus(
      "Não foi possível carregar os arquivos. Use um servidor HTTP na pasta do projeto.",
      true
    );
    return;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    setStatus("Erro ao interpretar o SVG.", true);
    return;
  }

  const svg = doc.documentElement;
  if (!(svg instanceof SVGSVGElement)) {
    setStatus("Documento SVG inválido.", true);
    return;
  }

  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.width = "100%";
  svg.style.height = "auto";

  const imported = document.importNode(svg, true);
  svgHost.replaceChildren(imported);

  const counts = buildCountsByCity(jsonData);
  const volunteersByCity = buildVolunteersByCity(jsonData);
  const totalVol = [...counts.values()].reduce((a, b) => a + b, 0);
  const initialStatusText = `${counts.size} municípios com voluntários no arquivo · ${totalVol} registros no total`;

  /** @type {Map<string, SVGGElement>} */
  const nameToGroup = new Map();
  imported.querySelectorAll("g[nome]").forEach((el) => {
    if (!(el instanceof SVGGElement)) return;
    const nome = el.getAttribute("nome");
    if (nome) nameToGroup.set(normalizeKey(nome), el);
  });

  let activeGroup = null;
  let filterActive = false;
  /** @type {Map<string, number>} */
  let filterMatchByKey = new Map();

  const resetPanelToPlaceholder = () => {
    panelTitleEl.textContent = "Selecione um município";
    panelContentEl.replaceChildren();
    const p = document.createElement("p");
    p.className = "municipio-panel-placeholder";
    p.textContent =
      "Clique em um polígono no mapa para listar os voluntários deste arquivo.";
    panelContentEl.appendChild(p);
  };

  const clearFilterHighlights = () => {
    imported.querySelectorAll("g[nome].filter-match").forEach((el) => {
      el.classList.remove("filter-match");
    });
  };

  const clearHashIfPresent = () => {
    if (!window.location.hash) return;
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  };

  const fullResetFromFilter = () => {
    filterActive = false;
    filterMatchByKey = new Map();
    clearFilterHighlights();
    if (activeGroup) {
      restoreFill(activeGroup);
      activeGroup = null;
    }
    clearMunicipioActiveClass(imported);
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
    resetPanelToPlaceholder();
    setStatus(initialStatusText);
    clearHashIfPresent();
  };

  /** @param {SVGGElement} g */
  const applyHoverFill = (g) => {
    const poly = g.querySelector("polygon");
    if (!poly) return;
    if (!g.dataset.savedFill) {
      const inherited =
        g.getAttribute("fill") || getComputedStyle(poly).fill || "#308bc9";
      g.dataset.savedFill = inherited;
    }
    poly.style.fill = "#f4d03f";
    poly.style.strokeWidth = "0.006";
  };

  /** @param {SVGGElement} g */
  const restoreFill = (g) => {
    const poly = g.querySelector("polygon");
    if (!poly) return;
    const saved = g.dataset.savedFill;
    if (saved) poly.style.fill = saved;
    else poly.style.removeProperty("fill");
    poly.style.strokeWidth = "";
  };

  /** @param {MouseEvent} e */
  const moveTooltip = (e) => {
    const pad = 16;
    let x = e.clientX + 12;
    let y = e.clientY + 12;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - pad) {
      x = e.clientX - rect.width - 12;
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = e.clientY - rect.height - 12;
    }
    tooltip.style.left = `${Math.max(pad, x)}px`;
    tooltip.style.top = `${Math.max(pad, y)}px`;
  };

  /** @param {SVGGElement | null} g @param {Map<string, number>} countsMap */
  const showTooltipForGroup = (g, countsMap) => {
    if (!g) {
      tooltip.classList.remove("visible");
      tooltip.setAttribute("aria-hidden", "true");
      return;
    }
    const nome = g.getAttribute("nome");
    if (!nome) return;
    tooltipMunicipio.textContent = nome;
    if (filterActive) {
      const key = normalizeKey(nome);
      const m = filterMatchByKey.get(key) ?? 0;
      tooltipCount.textContent = correspondenciasLabel(m);
    } else {
      const n = countForMunicipio(countsMap, nome);
      tooltipCount.textContent = voluntariosLabel(n);
    }
    tooltip.classList.add("visible");
    tooltip.setAttribute("aria-hidden", "false");
  };

  /** @param {string} rawQuery */
  const runFilterQuery = (rawQuery) => {
    const q = rawQuery.trim();
    const qLower = q.toLowerCase();

    if (qLower.length < FILTER_MIN_LENGTH) {
      fullResetFromFilter();
      return;
    }

    if (activeGroup) {
      restoreFill(activeGroup);
      activeGroup = null;
    }
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
    clearMunicipioActiveClass(imported);
    resetPanelToPlaceholder();

    clearFilterHighlights();
    filterMatchByKey = new Map();
    filterActive = true;

    const volunteers = Array.isArray(jsonData) ? jsonData : [];
    for (const row of volunteers) {
      if (typeof row !== "object" || row === null) continue;
      if (typeof row.cidade !== "string") continue;
      if (!volunteerMatchesQuery(row, qLower)) continue;
      const k = normalizeKey(row.cidade);
      filterMatchByKey.set(k, (filterMatchByKey.get(k) ?? 0) + 1);
    }

    for (const k of filterMatchByKey.keys()) {
      const g = nameToGroup.get(k);
      if (g) g.classList.add("filter-match");
    }

    const totalMatches = [...filterMatchByKey.values()].reduce(
      (a, b) => a + b,
      0
    );
    setStatus(
      `Filtro ativo: ${filterMatchByKey.size} município(s) · ${totalMatches} correspondência(s)`
    );
  };

  imported.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const g = target.closest("g[nome]");
    if (!(g instanceof SVGGElement)) return;
    const nome = g.getAttribute("nome");
    if (!nome) return;

    clearMunicipioActiveClass(imported);
    g.classList.add("municipio-active");
    renderVolunteerPanel(nome, volunteersByCity);
  });

  imported.addEventListener("pointermove", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const g = target.closest("g[nome]");
    const municipioGroup = g instanceof SVGGElement ? g : null;

    if (municipioGroup !== activeGroup) {
      if (activeGroup) restoreFill(activeGroup);
      activeGroup = municipioGroup;
      if (activeGroup) applyHoverFill(activeGroup);
    }

    showTooltipForGroup(activeGroup, counts);
    moveTooltip(e);
  });

  imported.addEventListener("pointerleave", () => {
    if (activeGroup) restoreFill(activeGroup);
    activeGroup = null;
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
  });

  setStatus(initialStatusText);

  const filterInput = document.getElementById("volunteer-filter");
  if (!(filterInput instanceof HTMLInputElement)) return;

  const fromHash = readFilterFromHash();
  if (fromHash) filterInput.value = fromHash;

  let debounceTimer = 0;
  filterInput.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = 0;
      runFilterQuery(filterInput.value);
    }, FILTER_DEBOUNCE_MS);
  });

  if (filterInput.value.trim().toLowerCase().length >= FILTER_MIN_LENGTH) {
    runFilterQuery(filterInput.value);
  }
};

main();
