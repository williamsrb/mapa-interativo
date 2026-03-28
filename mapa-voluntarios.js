const SVG_URL = "./mapa-es.svg";
const DATA_URL = "./voluntarios_es_teste.json";

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

let activeGroup = null;

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

/** @param {SVGGElement | null} g @param {Map<string, number>} counts */
const showTooltipForGroup = (g, counts) => {
  if (!g) {
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
    return;
  }
  const nome = g.getAttribute("nome");
  if (!nome) return;
  const n = countForMunicipio(counts, nome);
  tooltipMunicipio.textContent = nome;
  tooltipCount.textContent = voluntariosLabel(n);
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
};

/**
 * @param {SVGSVGElement} svg
 * @param {Map<string, number>} counts
 * @param {Map<string, Array<{ nome?: string; telefone?: string; habilidades_tecnicas?: string[] }>>} volunteersByCity
 */
const wireInteractivity = (svg, counts, volunteersByCity) => {
  svg.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const g = target.closest("g[nome]");
    if (!(g instanceof SVGGElement)) return;
    const nome = g.getAttribute("nome");
    if (!nome) return;

    clearMunicipioActiveClass(svg);
    g.classList.add("municipio-active");
    renderVolunteerPanel(nome, volunteersByCity);
  });

  svg.addEventListener("pointermove", (e) => {
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

  svg.addEventListener("pointerleave", () => {
    if (activeGroup) restoreFill(activeGroup);
    activeGroup = null;
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
  });
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
  wireInteractivity(imported, counts, volunteersByCity);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  setStatus(
    `${counts.size} municípios com voluntários no arquivo · ${total} registros no total`
  );
};

main();
