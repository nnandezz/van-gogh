"use strict";

/*
 * Van Gogh's browser prototype is split into small services so the local
 * storage and authentication adapters can later be replaced independently.
 * No password is stored; this local demo is not secure authentication.
 */

const ICONS = {
  mark: '<path d="M12 2.8c2.1 3.4 6.8 5.1 6.8 10.1a6.8 6.8 0 1 1-13.6 0C5.2 8 9.9 6.2 12 2.8Z"/><path d="M9 15.5c.4 1.4 1.4 2.1 2.8 2.1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/><path d="M8 8h8v8H8z"/>',
  sparkle: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};

const STORAGE_KEYS = {
  projects: "van-gogh.projects.v1",
  accounts: "van-gogh.local-accounts.v1",
  session: "van-gogh.local-session.v1",
};
const DB_NAME = "van-gogh-assets-v1";
const DB_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const PRESET_NAMES = {
  "1080x1080": "Cuadrado",
  "1920x1080": "Full HD horizontal",
  "1080x1920": "Full HD vertical",
  "2560x1440": "QHD",
  "3840x2160": "4K",
  "2480x3508": "A4",
};

const $ = (selector) => document.querySelector(selector);
const views = { home: $("#view-home"), editor: $("#view-editor"), auth: $("#view-auth") };
const homeImageInput = $("#home-image-input");
const resourceInput = $("#resource-input");
const dialog = $("#create-dialog");
const toastRegion = $("#toast-region");
let currentProject = null;
let currentResource = null;
let currentImageUrl = null;
let resourcePreviewUrls = [];
let recentPreviewUrls = [];
let routeSequence = 0;
let homeRenderSequence = 0;
let dragDepth = 0;
let authMode = "login";

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

document.querySelectorAll("[data-icon]").forEach((element) => {
  element.innerHTML = icon(element.dataset.icon, element.dataset.icon === "mark" ? 19 : 18);
});

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast("No se pudo guardar el estado local. Comprueba el espacio disponible del navegador.");
    return false;
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openAssetDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador no ofrece almacenamiento persistente para imágenes."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("resources")) {
        const store = database.createObjectStore("resources", { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir la biblioteca local."));
  });
}

const assetDatabase = openAssetDatabase();

function databaseRequest(mode, operation) {
  return assetDatabase.then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction("resources", mode);
    const request = operation(transaction.objectStore("resources"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo guardar el recurso."));
    transaction.onabort = () => reject(transaction.error || new Error("No se pudo completar el almacenamiento local."));
  }));
}

const assetStore = {
  put(resource) { return databaseRequest("readwrite", (store) => store.put(resource)); },
  get(id) { return databaseRequest("readonly", (store) => store.get(id)); },
  list(projectId) { return databaseRequest("readonly", (store) => store.index("projectId").getAll(projectId)); },
};

function readProjects() {
  const projects = readJson(STORAGE_KEYS.projects, []);
  return Array.isArray(projects) ? projects : [];
}

function storeProject(project) {
  const projects = readProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index < 0) projects.push(project);
  else projects[index] = project;
  writeJson(STORAGE_KEYS.projects, projects);
  return project;
}

function getProject(id) {
  return readProjects().find((project) => project.id === id) || null;
}

function updateProject(project, changes = {}) {
  Object.assign(project, changes, { updatedAt: Date.now() });
  storeProject(project);
}

function currentOwnerId() {
  return localAuth.currentUser()?.id || "local-guest";
}

function scopedProjects() {
  return readProjects()
    .filter((project) => project.ownerId === currentOwnerId())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{1,2}/g) || [], (part) => Number.parseInt(part, 16));
}

async function derivePasswordHash(password, saltHex) {
  if (!globalThis.crypto?.subtle) throw new Error("El navegador necesita un origen seguro (HTTPS o localhost) para la cuenta local.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/* Adapter boundary: replace this local demo with a real authentication service later. */
const localAuth = {
  currentUser() {
    const session = readJson(STORAGE_KEYS.session, null);
    if (!session?.id) return null;
    const accounts = readJson(STORAGE_KEYS.accounts, []);
    if (!Array.isArray(accounts)) return null;
    const account = accounts.find((item) => item.id === session.id);
    return account ? { id: account.id, email: account.email } : null;
  },
  async register(email, password) {
    const accounts = readJson(STORAGE_KEYS.accounts, []);
    if (accounts.some((account) => account.email === email)) throw new Error("Ya existe una cuenta local con ese correo.");
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const account = { id: newId(), email, salt, passwordHash: await derivePasswordHash(password, salt), createdAt: Date.now() };
    if (!writeJson(STORAGE_KEYS.accounts, [...accounts, account])) throw new Error("No se pudo guardar la cuenta local.");
    if (!writeJson(STORAGE_KEYS.session, { id: account.id })) throw new Error("La cuenta se creó, pero no se pudo iniciar la sesión local.");
    return { id: account.id, email: account.email };
  },
  async login(email, password) {
    const accounts = readJson(STORAGE_KEYS.accounts, []);
    if (!Array.isArray(accounts)) throw new Error("No encontramos una cuenta local con ese correo.");
    const account = accounts.find((item) => item.email === email);
    if (!account) throw new Error("No encontramos una cuenta local con ese correo.");
    const candidate = await derivePasswordHash(password, account.salt);
    if (!constantTimeEqual(candidate, account.passwordHash)) throw new Error("La contraseña no coincide con esta cuenta local.");
    if (!writeJson(STORAGE_KEYS.session, { id: account.id })) throw new Error("No se pudo iniciar la sesión local.");
    return { id: account.id, email: account.email };
  },
  logout() { localStorage.removeItem(STORAGE_KEYS.session); },
};

const localAuthAdapter = localAuth;

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileDimensions(file) {
  return new Promise((resolve, reject) => {
    const temporaryUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(temporaryUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(temporaryUrl);
      reject(new Error(`No se pudo abrir «${file.name}».`));
    };
    image.src = temporaryUrl;
  });
}

function cleanProjectName(filename) {
  return filename.replace(/\.[^.]+$/, "") || filename || "Imagen";
}

async function createImageProject(file) {
  if (!file?.type.startsWith("image/")) throw new Error("Selecciona un archivo de imagen compatible.");
  const dimensions = await fileDimensions(file);
  const projectId = newId();
  const resourceId = newId();
  const now = Date.now();
  const project = {
    id: projectId,
    ownerId: currentOwnerId(),
    name: cleanProjectName(file.name),
    width: dimensions.width,
    height: dimensions.height,
    kind: "photo",
    resourceIds: [resourceId],
    currentResourceId: resourceId,
    zoom: 100,
    createdAt: now,
    updatedAt: now,
  };
  await assetStore.put({ id: resourceId, projectId, name: file.name, type: file.type, size: file.size, ...dimensions, createdAt: now, blob: file });
  storeProject(project);
  go(`#/editor/${projectId}`);
  return project;
}

async function addResourcesToProject(files) {
  if (!currentProject) return;
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) throw new Error("Selecciona uno o varios archivos de imagen.");
  const added = [];
  for (const file of imageFiles) {
    const dimensions = await fileDimensions(file);
    const resource = {
      id: newId(),
      projectId: currentProject.id,
      name: file.name,
      type: file.type,
      size: file.size,
      ...dimensions,
      createdAt: Date.now(),
      blob: file,
    };
    await assetStore.put(resource);
    added.push(resource);
  }
  const resourceIds = new Set(currentProject.resourceIds || []);
  added.forEach((resource) => resourceIds.add(resource.id));
  const latest = added.at(-1);
  updateProject(currentProject, { resourceIds: [...resourceIds], currentResourceId: latest.id });
  await renderEditor(currentProject.id);
  showToast(added.length === 1 ? "Imagen guardada en los recursos del proyecto." : `${added.length} imágenes guardadas en los recursos del proyecto.`);
}

function setRouteView(name) {
  Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
  document.body.classList.toggle("is-editor", name === "editor");
}

function go(path) {
  location.hash = path;
}

function routeDetails() {
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [name, id] = path.split("/");
  if (name === "editor" && id) return { name: "editor", id };
  if (name === "login" || name === "register") return { name: "auth", mode: name };
  return { name: "home" };
}

function createProjectCard(project, resource) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-card glass-surface";
  button.setAttribute("aria-label", `Abrir ${project.name}, ${project.width} por ${project.height} píxeles`);
  const thumbnail = document.createElement("span");
  thumbnail.className = "project-thumb";
  if (resource?.blob) {
    const image = document.createElement("img");
    image.src = URL.createObjectURL(resource.blob);
    image.alt = "";
    image.loading = "lazy";
    button.dataset.previewUrl = image.src;
    recentPreviewUrls.push(image.src);
    thumbnail.append(image);
  } else {
    thumbnail.innerHTML = `<span class="blank-thumb-icon">${icon("sparkle", 28)}</span>`;
  }
  const information = document.createElement("span");
  information.className = "project-card-info";
  const title = document.createElement("span");
  title.className = "project-card-name";
  title.textContent = project.name;
  const meta = document.createElement("span");
  meta.className = "project-card-meta";
  const dimensions = document.createElement("span");
  dimensions.textContent = `${project.width} × ${project.height}`;
  const date = document.createElement("span");
  date.textContent = formatDate(project.updatedAt);
  meta.append(dimensions, date);
  information.append(title, meta);
  button.append(thumbnail, information);
  button.addEventListener("click", () => go(`#/editor/${project.id}`));
  return button;
}

async function renderHome() {
  const sequence = ++homeRenderSequence;
  recentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  recentPreviewUrls = [];
  const accountActions = $("#home-account-actions");
  const user = localAuthAdapter.currentUser();
  accountActions.replaceChildren();
  if (user) {
    const label = document.createElement("span");
    label.className = "account-label";
    label.textContent = `Sesión local · ${user.email}`;
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "button button-quiet";
    logout.textContent = "Cerrar sesión";
    logout.addEventListener("click", () => { localAuthAdapter.logout(); renderRoute(); });
    accountActions.append(label, logout);
  } else {
    const login = document.createElement("button");
    login.type = "button";
    login.className = "button button-quiet";
    login.textContent = "Iniciar sesión";
    login.addEventListener("click", () => go("#/login"));
    const register = document.createElement("button");
    register.type = "button";
    register.className = "button button-glass";
    register.textContent = "Crear cuenta local";
    register.addEventListener("click", () => go("#/register"));
    accountActions.append(login, register);
  }

  const grid = $("#recent-projects");
  grid.replaceChildren();
  const projects = scopedProjects().slice(0, 6);
  $("#recent-count").textContent = projects.length ? `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}` : "";
  if (!projects.length) {
    const empty = document.createElement("p");
    empty.className = "empty-recents";
    empty.textContent = "No hay proyectos recientes";
    grid.append(empty);
    return;
  }

  const cards = await Promise.all(projects.map(async (project) => {
    let resource = null;
    if (project.coverResourceId || project.currentResourceId) {
      try { resource = await assetStore.get(project.coverResourceId || project.currentResourceId); } catch { /* A missing thumbnail does not block the project list. */ }
    }
    return createProjectCard(project, resource);
  }));
  if (sequence !== homeRenderSequence) {
    cards.forEach((card) => { if (card.dataset.previewUrl) URL.revokeObjectURL(card.dataset.previewUrl); });
    recentPreviewUrls = recentPreviewUrls.filter((url) => !cards.some((card) => card.dataset.previewUrl === url));
    return;
  }
  cards.forEach((card) => grid.append(card));
}

function releaseResourcePreviews() {
  resourcePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  resourcePreviewUrls = [];
}

async function renderResourceList(project, resources) {
  releaseResourcePreviews();
  const list = $("#resource-list");
  list.replaceChildren();
  $("#resource-count").textContent = String(resources.length);
  if (!resources.length) {
    const empty = document.createElement("p");
    empty.className = "resource-empty";
    empty.textContent = "Este proyecto todavía no tiene imágenes. Importa una para añadirla a su biblioteca.";
    list.append(empty);
    return;
  }
  resources.sort((a, b) => a.createdAt - b.createdAt);
  resources.forEach((resource) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `resource-item${resource.id === project.currentResourceId ? " selected" : ""}`;
    button.setAttribute("aria-pressed", String(resource.id === project.currentResourceId));
    const thumb = document.createElement("span");
    thumb.className = "resource-thumb";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(resource.blob);
    image.alt = "";
    image.loading = "lazy";
    resourcePreviewUrls.push(image.src);
    thumb.append(image);
    const copy = document.createElement("span");
    copy.className = "resource-item-copy";
    const name = document.createElement("strong");
    name.textContent = resource.name;
    const dimensions = document.createElement("small");
    dimensions.textContent = `${resource.width} × ${resource.height} · ${formatBytes(resource.size)}`;
    copy.append(name, dimensions);
    button.append(thumb, copy);
    button.addEventListener("click", () => selectResource(resource.id));
    list.append(button);
  });
}

async function setCanvasResource(resource) {
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  currentResource = resource || null;
  const image = $("#document-image");
  const blank = $("#blank-canvas-message");
  const download = $("#download-original");
  if (!resource?.blob) {
    image.hidden = true;
    image.removeAttribute("src");
    blank.hidden = false;
    download.disabled = true;
    return;
  }
  currentImageUrl = URL.createObjectURL(resource.blob);
  image.src = currentImageUrl;
  image.alt = resource.name;
  image.hidden = false;
  blank.hidden = true;
  download.disabled = false;
}

function setZoom(value, persist = true) {
  const zoom = Math.max(25, Math.min(200, value));
  $("#document-canvas").style.setProperty("--canvas-zoom", String(zoom / 100));
  $("#zoom-value").textContent = `${zoom}%`;
  $("#zoom-out").disabled = zoom <= 25;
  $("#zoom-in").disabled = zoom >= 200;
  if (persist && currentProject) updateProject(currentProject, { zoom });
}

async function renderEditor(projectId) {
  const sequence = routeSequence;
  let project = getProject(projectId);
  if (!project || project.ownerId !== currentOwnerId()) {
    currentProject = null;
    go("#/");
    showToast("Este proyecto no está disponible en el perfil local actual.");
    return;
  }
  try {
    await assetDatabase;
    if (sequence !== routeSequence) return;
    currentProject = project;
    $("#editor-project-name").textContent = project.name;
    $("#document-dimensions").textContent = `${project.width} × ${project.height} px`;
    $("#document-kind").textContent = project.kind === "photo" ? "Fotografía" : "Lienzo en blanco";
    $("#document-canvas").style.setProperty("--canvas-ratio", `${project.width} / ${project.height}`);
    setZoom(project.zoom || 100, false);
    const resources = await assetStore.list(project.id);
    if (sequence !== routeSequence) return;
    const availableIds = new Set(resources.map((resource) => resource.id));
    if (!availableIds.has(project.currentResourceId)) {
      project.currentResourceId = resources.at(-1)?.id || null;
      storeProject(project);
    }
    const selected = resources.find((resource) => resource.id === project.currentResourceId) || null;
    await setCanvasResource(selected);
    await renderResourceList(project, resources);
  } catch (error) {
    showToast(error.message || "No se pudo abrir este proyecto local.");
  }
}

async function selectResource(resourceId) {
  if (!currentProject) return;
  try {
    const resource = await assetStore.get(resourceId);
    if (!resource || resource.projectId !== currentProject.id) throw new Error("El recurso no pertenece a este proyecto.");
    updateProject(currentProject, { currentResourceId: resource.id });
    await setCanvasResource(resource);
    await renderResourceList(currentProject, await assetStore.list(currentProject.id));
  } catch (error) {
    showToast(error.message || "No se pudo abrir el recurso.");
  }
}

async function renderRoute() {
  routeSequence += 1;
  const route = routeDetails();
  if (route.name !== "editor") {
    currentProject = null;
    currentResource = null;
    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = null;
    releaseResourcePreviews();
    if (route.name !== "home") {
      recentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      recentPreviewUrls = [];
    }
  }
  setRouteView(route.name);
  if (route.name === "home") {
    try { await assetDatabase; } catch { /* The project list still has a useful empty state. */ }
    await renderHome();
  } else if (route.name === "editor") {
    await renderEditor(route.id);
  } else {
    renderAuth(route.mode);
  }
}

function renderAuth(mode) {
  authMode = mode;
  const registering = mode === "register";
  $("#auth-kicker").textContent = registering ? "CUENTA LOCAL DE PRUEBA" : "CUENTA LOCAL DE PRUEBA";
  $("#auth-title").textContent = registering ? "Crear cuenta local" : "Iniciar sesión";
  $("#auth-intro").textContent = registering ? "Crea un perfil de demostración para este navegador." : "Accede al perfil guardado en este navegador.";
  $("#auth-password").setAttribute("autocomplete", registering ? "new-password" : "current-password");
  $("#auth-submit").textContent = registering ? "Crear cuenta local" : "Iniciar sesión";
  $("#auth-switch").innerHTML = registering
    ? '¿Ya tienes un perfil local? <button type="button" data-auth-route="login">Iniciar sesión</button>'
    : '¿Aún no tienes perfil local? <button type="button" data-auth-route="register">Crear cuenta local</button>';
  $("#auth-error").hidden = true;
  $("#auth-form").reset();
}

function showAuthError(message) {
  const error = $("#auth-error");
  error.textContent = message;
  error.hidden = false;
}

function setAuthBusy(busy) {
  const button = $("#auth-submit");
  button.disabled = busy;
  button.textContent = busy ? "Un momento…" : authMode === "register" ? "Crear cuenta local" : "Iniciar sesión";
}

function showCreateDialog() {
  $("#create-error").hidden = true;
  $("#resolution-preset").value = "1920x1080";
  $("#custom-dimensions").hidden = true;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function dimensionsFromDialog() {
  const preset = $("#resolution-preset").value;
  let width;
  let height;
  if (preset === "custom") {
    width = Number($("#custom-width").value);
    height = Number($("#custom-height").value);
  } else {
    [width, height] = preset.split("x").map(Number);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 32768 || height > 32768) {
    throw new Error("Introduce una anchura y una altura entre 1 y 32 768 píxeles.");
  }
  if (width * height > 100_000_000) throw new Error("La resolución supera el máximo de 100 megapíxeles para este prototipo.");
  return { width, height };
}

async function createBlankProject(width, height) {
  const now = Date.now();
  const project = {
    id: newId(),
    ownerId: currentOwnerId(),
    name: `Imagen ${width} × ${height}`,
    width,
    height,
    kind: "blank",
    resourceIds: [],
    currentResourceId: null,
    zoom: 100,
    createdAt: now,
    updatedAt: now,
  };
  storeProject(project);
  go(`#/editor/${project.id}`);
}

async function downloadCurrentOriginal() {
  if (!currentProject?.currentResourceId) return;
  try {
    const resource = await assetStore.get(currentProject.currentResourceId);
    if (!resource?.blob || resource.projectId !== currentProject.id) throw new Error("No se encontró la imagen original.");
    const url = URL.createObjectURL(resource.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resource.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showToast(error.message || "No se pudo descargar la imagen original.");
  }
}

$("#home-import").addEventListener("click", () => homeImageInput.click());
homeImageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  homeImageInput.value = "";
  if (!file) return;
  try { await createImageProject(file); }
  catch (error) { showToast(error.message || "No se pudo crear el proyecto."); }
});

$("#home-create").addEventListener("click", showCreateDialog);
$("#create-close").addEventListener("click", () => dialog.close?.());
$("#create-cancel").addEventListener("click", () => dialog.close?.());
$("#resolution-preset").addEventListener("change", (event) => {
  $("#custom-dimensions").hidden = event.target.value !== "custom";
});
$("#create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const { width, height } = dimensionsFromDialog();
    await createBlankProject(width, height);
    dialog.close?.();
  } catch (error) {
    const output = $("#create-error");
    output.textContent = error.message;
    output.hidden = false;
  }
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close?.();
});

$("#editor-home").addEventListener("click", () => go("#/"));
$("#resource-import").addEventListener("click", () => resourceInput.click());
resourceInput.addEventListener("change", async (event) => {
  const files = event.target.files;
  resourceInput.value = "";
  try { await addResourcesToProject(files); }
  catch (error) { showToast(error.message || "No se pudieron guardar las imágenes."); }
});

$("#zoom-out").addEventListener("click", () => setZoom((currentProject?.zoom || 100) - 10));
$("#zoom-in").addEventListener("click", () => setZoom((currentProject?.zoom || 100) + 10));
$("#zoom-reset").addEventListener("click", () => setZoom(100));
$("#download-original").addEventListener("click", downloadCurrentOriginal);
$("#auth-back").addEventListener("click", () => go("#/"));
$("#auth-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-auth-route]");
  if (button) go(`#/${button.dataset.authRoute}`);
});

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#auth-error").hidden = true;
  const email = $("#auth-email").value.trim().toLowerCase();
  const password = $("#auth-password").value;
  if (!email || !password) return showAuthError("Escribe tu correo y contraseña.");
  if (authMode === "register" && password.length < 8) return showAuthError("La contraseña debe tener al menos 8 caracteres.");
  setAuthBusy(true);
  try {
    if (authMode === "register") await localAuthAdapter.register(email, password);
    else await localAuthAdapter.login(email, password);
    $("#auth-form").reset();
    go("#/");
  } catch (error) {
    showAuthError(error.message || "No se pudo completar la operación local.");
  } finally {
    setAuthBusy(false);
  }
});

function hasFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

$("#app-shell").addEventListener("dragenter", (event) => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  $("#drop-overlay").hidden = false;
});
$("#app-shell").addEventListener("dragover", (event) => {
  if (hasFileDrag(event)) event.preventDefault();
});
$("#app-shell").addEventListener("dragleave", (event) => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $("#drop-overlay").hidden = true;
});
$("#app-shell").addEventListener("drop", async (event) => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  $("#drop-overlay").hidden = true;
  const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return showToast("Suelta archivos de imagen compatibles.");
  const route = routeDetails();
  try {
    if (route.name === "editor" && currentProject) await addResourcesToProject(files);
    else if (route.name === "home") {
      const project = await createImageProject(files[0]);
      if (files.length > 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        if (currentProject?.id === project.id) await addResourcesToProject(files.slice(1));
      }
    } else {
      showToast("Vuelve al inicio para crear un proyecto con esta imagen.");
    }
  } catch (error) {
    showToast(error.message || "No se pudo añadir la imagen.");
  }
});

window.addEventListener("hashchange", renderRoute);
window.addEventListener("pagehide", () => {
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  releaseResourcePreviews();
});

if (!location.hash) location.hash = "#/";
else renderRoute();

assetDatabase.then(() => {
  if (routeDetails().name === "home") renderHome();
}).catch(() => {
  showToast("El navegador no pudo iniciar la biblioteca local de imágenes.");
});
