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
  trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
  layer: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  crop: '<path d="M6 3v12a3 3 0 0 0 3 3h12M3 6h12a3 3 0 0 1 3 3v12"/>',
  undo: '<path d="M3 7v6h6"/><path d="M5.2 13A8 8 0 1 0 7 6.3L3 10"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M18.8 13A8 8 0 1 1 17 6.3l4 3.7"/>',
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
let selectedLayerId = null;
let objectDrag = null;
let cropMode = false;
const projectHistories = new Map();
let layerDragId = null;
let layerDropIndicator = null;
let canvasObjectUrls = [];
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

document.querySelectorAll("[data-header-favicon]").forEach((image) => {
  const revealIfAvailable = () => { image.hidden = image.naturalWidth === 0; };
  image.addEventListener("load", revealIfAvailable);
  image.addEventListener("error", () => { image.hidden = true; });
  if (image.complete) revealIfAvailable();
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
  deleteProject(projectId) {
    return assetDatabase.then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction("resources", "readwrite");
      const store = transaction.objectStore("resources");
      const request = store.index("projectId").getAllKeys(projectId);
      let deletedCount = 0;
      request.onsuccess = () => {
        deletedCount = request.result.length;
        request.result.forEach((resourceId) => store.delete(resourceId));
      };
      request.onerror = () => reject(request.error || new Error("No se pudieron localizar las imágenes del proyecto."));
      transaction.oncomplete = () => resolve(deletedCount);
      transaction.onerror = () => reject(transaction.error || new Error("No se pudieron eliminar las imágenes del proyecto."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló la eliminación de las imágenes."));
    }));
  },
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

function cloneLayers(layers) {
  return (layers || []).map((layer) => ({ ...layer, crop: layer.crop ? { ...layer.crop } : undefined }));
}

function projectSnapshot(project = currentProject) {
  return project ? { name: project.name, layers: cloneLayers(project.layers) } : null;
}

function projectHistory(projectId = currentProject?.id) {
  if (!projectId) return null;
  if (!projectHistories.has(projectId)) projectHistories.set(projectId, { past: [], future: [] });
  return projectHistories.get(projectId);
}

function updateHistoryButtons() {
  const history = projectHistory();
  $("#history-undo").disabled = !history?.past.length;
  $("#history-redo").disabled = !history?.future.length;
}

function recordHistory(before, project = currentProject) {
  if (!project || !before) return;
  const after = projectSnapshot(project);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const history = projectHistory(project.id);
  history.past.push(before);
  if (history.past.length > 100) history.past.shift();
  history.future.length = 0;
  updateHistoryButtons();
}

async function applyHistorySnapshot(snapshot) {
  if (!currentProject || !snapshot) return;
  updateProject(currentProject, { name: snapshot.name, layers: cloneLayers(snapshot.layers) });
  $("#editor-project-name").textContent = currentProject.name;
  $("#project-name-input").value = currentProject.name;
  const resources = await assetStore.list(currentProject.id);
  renderCanvasObjects(resources);
  renderLayerPanel(currentProject);
  updateHistoryButtons();
}

async function undoProjectChange() {
  const history = projectHistory();
  if (!history?.past.length) return;
  history.future.push(projectSnapshot());
  await applyHistorySnapshot(history.past.pop());
}

async function redoProjectChange() {
  const history = projectHistory();
  if (!history?.future.length) return;
  history.past.push(projectSnapshot());
  await applyHistorySnapshot(history.future.pop());
}

function beginProjectRename() {
  if (!currentProject) return;
  const display = $("#editor-project-name");
  const input = $("#project-name-input");
  input.value = currentProject.name;
  display.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}

function finishProjectRename(save) {
  const input = $("#project-name-input");
  const display = $("#editor-project-name");
  if (input.hidden) return;
  const before = projectSnapshot();
  const name = input.value.trim();
  input.hidden = true;
  display.hidden = false;
  if (save && name && name !== currentProject?.name) {
    updateProject(currentProject, { name });
    recordHistory(before);
  }
  display.textContent = currentProject?.name || before?.name || "Proyecto";
  updateHistoryButtons();
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
  const layer = { id: newId(), resourceId, name: cleanProjectName(file.name), x: 0, y: 0, width: dimensions.width, height: dimensions.height, aspectRatio: dimensions.width / dimensions.height, rotation: 0 };
  const project = {
    id: projectId,
    ownerId: currentOwnerId(),
    name: cleanProjectName(file.name),
    width: dimensions.width,
    height: dimensions.height,
    kind: "photo",
    resourceIds: [resourceId],
    currentResourceId: resourceId,
    layers: [layer],
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
  const before = projectSnapshot();
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) throw new Error("Selecciona uno o varios archivos de imagen.");
  const added = [];
  const layers = [...(currentProject.layers || [])];
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
    const scale = Math.min(1, (currentProject.width * 0.72) / dimensions.width, (currentProject.height * 0.72) / dimensions.height);
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    layers.push({ id: newId(), resourceId: resource.id, name: cleanProjectName(file.name), x: (currentProject.width - width) / 2, y: (currentProject.height - height) / 2, width, height, aspectRatio: dimensions.width / dimensions.height, rotation: 0 });
  }
  const resourceIds = new Set(currentProject.resourceIds || []);
  added.forEach((resource) => resourceIds.add(resource.id));
  const latest = added.at(-1);
  updateProject(currentProject, { resourceIds: [...resourceIds], currentResourceId: latest.id, layers });
  recordHistory(before);
  selectedLayerId = layers.at(-1)?.id || null;
  await renderEditor(currentProject.id);
  showToast(added.length === 1 ? "Imagen guardada en los recursos del proyecto." : `${added.length} imágenes guardadas en los recursos del proyecto.`);
}

async function addResourceLayer(resourceId, position = null) {
  if (!currentProject) return;
  const before = projectSnapshot();
  const resource = await assetStore.get(resourceId);
  if (!resource || resource.projectId !== currentProject.id) throw new Error("El recurso no pertenece a este proyecto.");
  const scale = Math.min(1, (currentProject.width * 0.72) / resource.width, (currentProject.height * 0.72) / resource.height);
  const width = resource.width * scale;
  const height = resource.height * scale;
  const layer = {
    id: newId(), resourceId, name: cleanProjectName(resource.name),
    x: position ? position.x - width / 2 : (currentProject.width - width) / 2,
    y: position ? position.y - height / 2 : (currentProject.height - height) / 2,
    width, height, rotation: 0,
    aspectRatio: resource.width / resource.height,
  };
  const layers = [...(currentProject.layers || []), layer];
  updateProject(currentProject, { layers, currentResourceId: resourceId });
  recordHistory(before);
  selectedLayerId = layer.id;
  await renderEditor(currentProject.id);
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
  const card = document.createElement("article");
  card.className = "project-card glass-surface";
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "project-open";
  openButton.setAttribute("aria-label", `Abrir ${project.name}, ${project.width} por ${project.height} píxeles`);
  const thumbnail = document.createElement("span");
  thumbnail.className = "project-thumb";
  if (resource?.blob) {
    const image = document.createElement("img");
    image.src = URL.createObjectURL(resource.blob);
    image.alt = "";
    image.loading = "lazy";
    card.dataset.previewUrl = image.src;
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
  openButton.append(thumbnail, information);
  openButton.addEventListener("click", () => go(`#/editor/${project.id}`));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "project-delete";
  deleteButton.setAttribute("aria-label", `Eliminar ${project.name}`);
  deleteButton.title = `Eliminar ${project.name}`;
  deleteButton.innerHTML = icon("trash", 15);
  deleteButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    deleteButton.disabled = true;
    await deleteRecentProject(project, deleteButton);
  });
  card.append(openButton, deleteButton);
  return card;
}

async function deleteRecentProject(project, button) {
  if (project.ownerId !== currentOwnerId()) return;
  const confirmed = window.confirm(`¿Eliminar «${project.name}» y todas sus imágenes? Esta acción no se puede deshacer.`);
  if (!confirmed) {
    button.disabled = false;
    return;
  }

  const projectsBeforeDelete = readProjects();
  const remainingProjects = projectsBeforeDelete.filter((item) => item.id !== project.id);
  if (!writeJson(STORAGE_KEYS.projects, remainingProjects)) {
    button.disabled = false;
    return;
  }
  try {
    await assetStore.deleteProject(project.id);
    await renderHome();
  } catch (error) {
    writeJson(STORAGE_KEYS.projects, projectsBeforeDelete);
    button.disabled = false;
    showToast(error.message || "No se pudo eliminar el proyecto.");
  }
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
    button.draggable = true;
    button.setAttribute("aria-label", `Añadir ${resource.name} al lienzo`);
    button.addEventListener("click", async () => {
      try { await addResourceLayer(resource.id); }
      catch (error) { showToast(error.message || "No se pudo añadir la imagen al lienzo."); }
    });
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("application/x-van-gogh-resource", resource.id);
      event.dataTransfer.effectAllowed = "copy";
    });
    list.append(button);
  });
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
    projectHistory(project.id);
    selectedLayerId = selectedLayerId && project.layers?.some((layer) => layer.id === selectedLayerId) ? selectedLayerId : project.layers?.at(-1)?.id || null;
    $("#editor-project-name").textContent = project.name;
    $("#project-name-input").value = project.name;
    $("#document-dimensions").textContent = `${project.width} × ${project.height} px`;
    $("#document-kind").textContent = project.kind === "photo" ? "Fotografía" : "Lienzo en blanco";
    $("#document-canvas").style.setProperty("--canvas-ratio", `${project.width} / ${project.height}`);
    setZoom(project.zoom || 100, false);
    const resources = await assetStore.list(project.id);
    if (sequence !== routeSequence) return;
    const availableIds = new Set(resources.map((resource) => resource.id));
    if (!availableIds.has(project.currentResourceId)) {
      project.currentResourceId = resources.at(-1)?.id || null;
    }
    $("#download-original").disabled = !project.currentResourceId;
    if (!Array.isArray(project.layers)) {
      const initial = resources.find((resource) => resource.id === project.currentResourceId) || resources[0];
      if (initial) {
        const scale = Math.min(1, (project.width * 0.72) / initial.width, (project.height * 0.72) / initial.height);
        const width = initial.width * scale;
        const height = initial.height * scale;
        project.layers = [{ id: newId(), resourceId: initial.id, name: cleanProjectName(initial.name), x: (project.width - width) / 2, y: (project.height - height) / 2, width, height, aspectRatio: initial.width / initial.height, rotation: 0 }];
        selectedLayerId = project.layers[0].id;
      } else project.layers = [];
    }
    project.layers = project.layers.filter((layer) => availableIds.has(layer.resourceId));
    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
    project.layers.forEach((layer) => {
      const resource = resourcesById.get(layer.resourceId);
      if (!layer.aspectRatio && resource?.height) layer.aspectRatio = resource.width / resource.height;
    });
    storeProject(project);
    if (!project.layers.some((layer) => layer.id === selectedLayerId)) selectedLayerId = project.layers.at(-1)?.id || null;
    renderCanvasObjects(resources);
    await renderResourceList(project, resources);
    renderLayerPanel(project);
    updateHistoryButtons();
  } catch (error) {
    showToast(error.message || "No se pudo abrir este proyecto local.");
  }
}

function renderCanvasObjects(resources) {
  const stage = $("#canvas-objects");
  canvasObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  canvasObjectUrls = [];
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  stage.replaceChildren();
  const layers = currentProject?.layers || [];
  $("#blank-canvas-message").hidden = layers.length > 0;
  layers.forEach((layer) => {
    const resource = resourceMap.get(layer.resourceId);
    if (!resource?.blob) return;
    const object = document.createElement("div");
    object.className = `canvas-object${layer.id === selectedLayerId ? " selected" : ""}`;
    object.dataset.layerId = layer.id;
    object.style.left = `${layer.x / currentProject.width * 100}%`;
    object.style.top = `${layer.y / currentProject.height * 100}%`;
    object.style.width = `${layer.width / currentProject.width * 100}%`;
    object.style.height = `${layer.height / currentProject.height * 100}%`;
    object.style.transform = `rotate(${layer.rotation || 0}deg)`;
    const frame = document.createElement("div");
    frame.className = "canvas-object-frame";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(resource.blob);
    canvasObjectUrls.push(image.src);
    image.alt = layer.name || resource.name;
    image.draggable = false;
    const crop = layer.crop || { x: 0, y: 0, width: 1, height: 1 };
    image.style.width = `${100 / crop.width}%`;
    image.style.height = `${100 / crop.height}%`;
    image.style.position = "absolute";
    image.style.left = `${-crop.x / crop.width * 100}%`;
    image.style.top = `${-crop.y / crop.height * 100}%`;
    if (cropMode && layer.id === selectedLayerId) object.classList.add("crop-mode");
    frame.append(image);
    object.append(frame);
    if (layer.id === selectedLayerId) {
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((handle) => {
        const control = document.createElement("button");
        control.type = "button";
        control.className = `transform-handle handle-${handle}`;
        control.dataset.resize = handle;
        if (cropMode) control.dataset.crop = handle;
        control.setAttribute("aria-label", "Cambiar tamaño de la imagen");
        object.append(control);
      });
      const rotate = document.createElement("button");
      rotate.type = "button";
      rotate.className = "rotate-handle";
      rotate.dataset.rotate = "true";
      rotate.title = "Rotar imagen";
      rotate.setAttribute("aria-label", "Rotar imagen");
      rotate.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-3L3 11m0-5v5h5m-4 2a8 8 0 0 0 14.8 3L21 13m0 5v-5h-5"/></svg>';
      object.append(rotate);
    }
    object.addEventListener("pointerdown", (event) => beginObjectGesture(event, layer));
    object.addEventListener("click", (event) => { event.stopPropagation(); if (selectedLayerId !== layer.id) { selectedLayerId = layer.id; cropMode = false; renderCanvasObjects(resources); renderLayerPanel(currentProject); } });
    stage.append(object);
  });
}

function renderLayerPanel(project) {
  const list = $("#layer-list");
  const layers = project?.layers || [];
  list.replaceChildren();
  $("#layer-count").textContent = String(layers.length);
  layers.slice().reverse().forEach((layer) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `layer-item${layer.id === selectedLayerId ? " selected" : ""}`;
    row.dataset.layerId = layer.id;
    row.draggable = true;
    row.setAttribute("aria-pressed", String(layer.id === selectedLayerId));
    const glyph = document.createElement("span");
    glyph.className = "layer-glyph";
    glyph.innerHTML = icon("layer", 16);
    const name = document.createElement("span");
    name.className = "layer-item-name";
    name.textContent = layer.name || "Imagen";
    const number = document.createElement("small");
    number.textContent = String(layers.length - layers.indexOf(layer)).padStart(2, "0");
    row.append(glyph, name, number);
    row.addEventListener("click", () => {
      selectedLayerId = layer.id;
      cropMode = false;
      assetStore.list(project.id).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(project); });
    });
    row.addEventListener("dragstart", (event) => {
      layerDragId = layer.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-van-gogh-layer", layer.id);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      layerDragId = null;
      clearLayerDropIndicator();
      list.querySelectorAll(".layer-item").forEach((item) => item.classList.remove("dragging", "drop-before", "drop-after"));
    });
    row.addEventListener("dragover", (event) => {
      if (!layerDragId || layerDragId === layer.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearLayerDropIndicator();
      layerDropIndicator = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? "before" : "after";
      row.classList.add(layerDropIndicator === "before" ? "drop-before" : "drop-after");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("application/x-van-gogh-layer") || layerDragId;
      if (draggedId && draggedId !== layer.id) reorderLayer(draggedId, layer.id, layerDropIndicator !== "after");
      layerDragId = null;
      layerDropIndicator = null;
    });
    list.append(row);
  });
  const hasSelection = layers.some((layer) => layer.id === selectedLayerId);
  $("#layer-send-back").disabled = !hasSelection || layers[0]?.id === selectedLayerId;
  $("#layer-bring-front").disabled = !hasSelection || layers.at(-1)?.id === selectedLayerId;
  $("#layer-remove").disabled = !hasSelection;
  $("#layer-crop").disabled = !hasSelection;
  $("#layer-crop").classList.toggle("active", cropMode && hasSelection);
  $("#layer-crop").setAttribute("aria-pressed", String(cropMode && hasSelection));
}

function clearLayerDropIndicator() {
  $("#layer-list").querySelectorAll(".layer-item").forEach((item) => item.classList.remove("drop-before", "drop-after"));
  layerDropIndicator = null;
}

function reorderLayer(draggedId, targetId, insertBefore) {
  if (!currentProject || draggedId === targetId) return;
  const before = projectSnapshot();
  const visibleOrder = [...currentProject.layers].reverse();
  const draggedIndex = visibleOrder.findIndex((layer) => layer.id === draggedId);
  if (draggedIndex < 0) return;
  const [dragged] = visibleOrder.splice(draggedIndex, 1);
  const targetIndex = visibleOrder.findIndex((layer) => layer.id === targetId);
  if (targetIndex < 0) return;
  visibleOrder.splice(targetIndex + (insertBefore ? 0 : 1), 0, dragged);
  updateProject(currentProject, { layers: visibleOrder.reverse() });
  recordHistory(before);
  const projectId = currentProject.id;
  assetStore.list(projectId).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
}

function moveSelectedLayer(toFront) {
  if (!currentProject || !selectedLayerId) return;
  const before = projectSnapshot();
  const layers = [...currentProject.layers];
  const index = layers.findIndex((layer) => layer.id === selectedLayerId);
  if (index < 0) return;
  const [layer] = layers.splice(index, 1);
  layers.splice(toFront ? layers.length : 0, 0, layer);
  updateProject(currentProject, { layers });
  recordHistory(before);
  assetStore.list(currentProject.id).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
}

function removeSelectedLayer() {
  if (!currentProject || !selectedLayerId) return;
  const before = projectSnapshot();
  const layers = currentProject.layers.filter((layer) => layer.id !== selectedLayerId);
  selectedLayerId = layers.at(-1)?.id || null;
  cropMode = false;
  updateProject(currentProject, { layers });
  recordHistory(before);
  assetStore.list(currentProject.id).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
}

function canvasPoint(event) {
  const rect = $("#document-canvas").getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * currentProject.width, y: (event.clientY - rect.top) / rect.height * currentProject.height };
}

function rotatedLayerBounds(layer) {
  const radians = (layer.rotation || 0) * Math.PI / 180;
  const width = Math.abs(layer.width * Math.cos(radians)) + Math.abs(layer.height * Math.sin(radians));
  const height = Math.abs(layer.width * Math.sin(radians)) + Math.abs(layer.height * Math.cos(radians));
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  return { left: centerX - width / 2, centerX, right: centerX + width / 2, top: centerY - height / 2, centerY, bottom: centerY + height / 2 };
}

function nearestSnap(origin, ownAnchors, targetAnchors, threshold) {
  let nearest = null;
  ownAnchors.forEach((own) => targetAnchors.forEach((target) => {
    const delta = target - own;
    if (Math.abs(delta) <= threshold && (!nearest || Math.abs(delta) < Math.abs(nearest.delta))) nearest = { origin: origin + delta, guide: target, delta };
  }));
  return nearest;
}

function applySmartSnap(layer, x, y, disabled) {
  if (disabled) { showCanvasGuides(null, null); return { x, y }; }
  const rect = $("#document-canvas").getBoundingClientRect();
  const thresholdX = currentProject.width * 9 / Math.max(1, rect.width);
  const thresholdY = currentProject.height * 9 / Math.max(1, rect.height);
  const moving = rotatedLayerBounds({ ...layer, x, y });
  const targets = [{ left: 0, centerX: currentProject.width / 2, right: currentProject.width, top: 0, centerY: currentProject.height / 2, bottom: currentProject.height }];
  currentProject.layers.filter((other) => other.id !== layer.id).forEach((other) => targets.push(rotatedLayerBounds(other)));
  let snapX = null;
  let snapY = null;
  targets.forEach((target) => {
    const horizontal = nearestSnap(x, [moving.left, moving.centerX, moving.right], [target.left, target.centerX, target.right], thresholdX);
    const vertical = nearestSnap(y, [moving.top, moving.centerY, moving.bottom], [target.top, target.centerY, target.bottom], thresholdY);
    if (horizontal && (!snapX || Math.abs(horizontal.delta) < Math.abs(snapX.delta))) snapX = horizontal;
    if (vertical && (!snapY || Math.abs(vertical.delta) < Math.abs(snapY.delta))) snapY = vertical;
  });
  showCanvasGuides(snapX?.guide ?? null, snapY?.guide ?? null);
  return { x: snapX?.origin ?? x, y: snapY?.origin ?? y };
}

function showCanvasGuides(x, y) {
  const guides = $("#canvas-guides");
  guides.replaceChildren();
  if (x !== null) {
    const vertical = document.createElement("span");
    vertical.className = "canvas-guide-line vertical";
    vertical.style.left = `${x / currentProject.width * 100}%`;
    guides.append(vertical);
  }
  if (y !== null) {
    const horizontal = document.createElement("span");
    horizontal.className = "canvas-guide-line horizontal";
    horizontal.style.top = `${y / currentProject.height * 100}%`;
    guides.append(horizontal);
  }
}

function beginObjectGesture(event, layer) {
  if (!currentProject) return;
  const node = event.currentTarget;
  if (selectedLayerId !== layer.id) {
    selectedLayerId = layer.id;
    cropMode = false;
    node.classList.add("selected");
    renderLayerPanel(currentProject);
  }
  event.stopPropagation();
  const point = canvasPoint(event);
  const center = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
  const mode = event.target.dataset.crop ? "crop" : event.target.dataset.resize ? "resize" : event.target.dataset.rotate ? "rotate" : "move";
  objectDrag = { pointerId: event.pointerId, layerId: layer.id, node, mode, handle: event.target.dataset.crop || event.target.dataset.resize, before: projectSnapshot(), start: { ...layer, crop: layer.crop ? { ...layer.crop } : null }, point, center, angle: Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI, initialRotation: layer.rotation || 0 };
  node.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", updateObjectGesture);
  window.addEventListener("pointerup", finishObjectGesture);
  window.addEventListener("pointercancel", finishObjectGesture);
}

function updateObjectGesture(event) {
  if (!objectDrag || event.pointerId !== objectDrag.pointerId) return;
  const layer = currentProject?.layers.find((item) => item.id === objectDrag.layerId);
  if (!layer) return;
  const point = canvasPoint(event);
  const dx = point.x - objectDrag.point.x;
  const dy = point.y - objectDrag.point.y;
  const start = objectDrag.start;
  if (objectDrag.mode === "move") {
    const snapped = applySmartSnap(layer, start.x + dx, start.y + dy, event.altKey);
    layer.x = snapped.x;
    layer.y = snapped.y;
  } else if (objectDrag.mode === "rotate") {
    const center = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const angle = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;
    const deltaAngle = ((angle - objectDrag.angle + 540) % 360) - 180;
    layer.rotation = objectDrag.initialRotation + deltaAngle;
  } else if (objectDrag.mode === "crop") {
    const radians = -(start.rotation || 0) * Math.PI / 180;
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
    const initial = start.crop || { x: 0, y: 0, width: 1, height: 1 };
    const crop = { ...initial };
    const handle = objectDrag.handle;
    if (handle.includes("e")) crop.width = Math.max(.02, initial.width + localX / start.width * initial.width);
    if (handle.includes("w")) { const change = localX / start.width * initial.width; crop.x = initial.x + change; crop.width = Math.max(.02, initial.width - change); }
    if (handle.includes("s")) crop.height = Math.max(.02, initial.height + localY / start.height * initial.height);
    if (handle.includes("n")) { const change = localY / start.height * initial.height; crop.y = initial.y + change; crop.height = Math.max(.02, initial.height - change); }
    crop.x = Math.max(0, Math.min(1 - crop.width, crop.x));
    crop.y = Math.max(0, Math.min(1 - crop.height, crop.y));
    crop.width = Math.min(crop.width, 1 - crop.x);
    crop.height = Math.min(crop.height, 1 - crop.y);
    layer.crop = crop;
    layer.width = start.width * crop.width / initial.width;
    layer.height = start.height * crop.height / initial.height;
    const shiftX = handle.includes("w") ? (start.width - layer.width) / 2 : handle.includes("e") ? (layer.width - start.width) / 2 : 0;
    const shiftY = handle.includes("n") ? (start.height - layer.height) / 2 : handle.includes("s") ? (layer.height - start.height) / 2 : 0;
    const rotate = (start.rotation || 0) * Math.PI / 180;
    const centerX = start.x + start.width / 2 + shiftX * Math.cos(rotate) - shiftY * Math.sin(rotate);
    const centerY = start.y + start.height / 2 + shiftX * Math.sin(rotate) + shiftY * Math.cos(rotate);
    layer.x = centerX - layer.width / 2;
    layer.y = centerY - layer.height / 2;
    layer.aspectRatio = layer.width / layer.height;
    const image = objectDrag.node.querySelector("img");
    image.style.width = `${100 / crop.width}%`;
    image.style.height = `${100 / crop.height}%`;
    image.style.left = `${-crop.x / crop.width * 100}%`;
    image.style.top = `${-crop.y / crop.height * 100}%`;
  } else {
    const radians = -(start.rotation || 0) * Math.PI / 180;
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
    const handle = objectDrag.handle;
    const horizontalEdge = handle.includes("w") || handle.includes("e");
    const verticalEdge = handle.includes("n") || handle.includes("s");
    const horizontalDirection = handle.includes("w") ? -1 : 1;
    const verticalDirection = handle.includes("n") ? -1 : 1;
    const aspectRatio = start.aspectRatio || start.width / start.height;
    const corner = horizontalEdge && verticalEdge;
    if (corner) {
      const widthScale = localX * horizontalDirection / start.width;
      const heightScale = localY * verticalDirection / start.height;
      const scaleChange = Math.abs(widthScale) >= Math.abs(heightScale) ? widthScale : heightScale;
      const minimumScale = Math.max(8 / start.width, 8 / start.height);
      const scale = Math.max(minimumScale, 1 + scaleChange);
      layer.width = start.width * scale;
      layer.height = layer.width / aspectRatio;
    } else if (event.shiftKey) {
      layer.width = horizontalEdge ? Math.max(8, start.width + horizontalDirection * localX) : start.width;
      layer.height = verticalEdge ? Math.max(8, start.height + verticalDirection * localY) : start.height;
    } else if (horizontalEdge) {
      layer.width = Math.max(8, start.width + horizontalDirection * localX);
      layer.height = layer.width / aspectRatio;
    } else {
      layer.height = Math.max(8, start.height + verticalDirection * localY);
      layer.width = layer.height * aspectRatio;
    }
    const centerShiftX = horizontalEdge ? horizontalDirection * (layer.width - start.width) / 2 : 0;
    const centerShiftY = verticalEdge ? verticalDirection * (layer.height - start.height) / 2 : 0;
    const rotate = (start.rotation || 0) * Math.PI / 180;
    const centerX = start.x + start.width / 2 + centerShiftX * Math.cos(rotate) - centerShiftY * Math.sin(rotate);
    const centerY = start.y + start.height / 2 + centerShiftX * Math.sin(rotate) + centerShiftY * Math.cos(rotate);
    layer.x = centerX - layer.width / 2;
    layer.y = centerY - layer.height / 2;
  }
  const node = objectDrag.node;
  node.style.left = `${layer.x / currentProject.width * 100}%`;
  node.style.top = `${layer.y / currentProject.height * 100}%`;
  node.style.width = `${layer.width / currentProject.width * 100}%`;
  node.style.height = `${layer.height / currentProject.height * 100}%`;
  node.style.transform = `rotate(${layer.rotation || 0}deg)`;
}

function finishObjectGesture(event) {
  if (!objectDrag || event.pointerId !== objectDrag.pointerId) return;
  window.removeEventListener("pointermove", updateObjectGesture);
  window.removeEventListener("pointerup", finishObjectGesture);
  window.removeEventListener("pointercancel", finishObjectGesture);
  showCanvasGuides(null, null);
  if (currentProject) {
    const projectId = currentProject.id;
    updateProject(currentProject, { layers: currentProject.layers.map((layer) => ({ ...layer })) });
    recordHistory(objectDrag.before);
    assetStore.list(projectId).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
  }
  objectDrag = null;
}

async function exportComposition() {
  if (!currentProject) return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = currentProject.width;
    canvas.height = currentProject.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no pudo crear el lienzo de exportación.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of currentProject.layers || []) {
      const resource = await assetStore.get(layer.resourceId);
      if (!resource?.blob || resource.projectId !== currentProject.id) continue;
      const bitmap = await createImageBitmap(resource.blob);
      context.save();
      context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
      context.rotate((layer.rotation || 0) * Math.PI / 180);
      const crop = layer.crop || { x: 0, y: 0, width: 1, height: 1 };
      context.drawImage(bitmap, crop.x * bitmap.width, crop.y * bitmap.height, crop.width * bitmap.width, crop.height * bitmap.height, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      context.restore();
      bitmap.close?.();
    }
    const format = $("#export-format").value;
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo generar la imagen.")), format, format === "image/jpeg" ? 0.92 : undefined));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentProject.name.replace(/[\\/:*?"<>|]/g, "-") || "Van-Gogh"}.${format === "image/png" ? "png" : "jpg"}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) { showToast(error.message || "No se pudo exportar la composición."); }
}

async function renderRoute() {
  routeSequence += 1;
  const route = routeDetails();
  if (route.name !== "editor") {
    currentProject = null;
    currentResource = null;
    canvasObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    canvasObjectUrls = [];
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
    layers: [],
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
  const files = [...(event.target.files || [])];
  resourceInput.value = "";
  try { await addResourcesToProject(files); }
  catch (error) { showToast(error.message || "No se pudieron guardar las imágenes."); }
});

$("#zoom-out").addEventListener("click", () => setZoom((currentProject?.zoom || 100) - 10));
$("#zoom-in").addEventListener("click", () => setZoom((currentProject?.zoom || 100) + 10));
$("#zoom-reset").addEventListener("click", () => setZoom(100));
$("#history-undo").addEventListener("click", undoProjectChange);
$("#history-redo").addEventListener("click", redoProjectChange);
$("#editor-project-name").addEventListener("click", beginProjectRename);
$("#editor-project-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); beginProjectRename(); }
});
$("#project-name-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); finishProjectRename(true); }
  if (event.key === "Escape") { event.preventDefault(); finishProjectRename(false); }
});
$("#project-name-input").addEventListener("blur", () => finishProjectRename(true));
window.addEventListener("keydown", (event) => {
  if ((!event.ctrlKey && !event.metaKey) || routeDetails().name !== "editor") return;
  if (event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
  if (event.code === "KeyZ" && !event.shiftKey) { event.preventDefault(); undoProjectChange(); }
  else if (event.code === "KeyY" || (event.code === "KeyZ" && event.shiftKey)) { event.preventDefault(); redoProjectChange(); }
});
$("#download-original").addEventListener("click", downloadCurrentOriginal);
$("#export-composition").addEventListener("click", exportComposition);
$("#layer-bring-front").addEventListener("click", () => moveSelectedLayer(true));
$("#layer-send-back").addEventListener("click", () => moveSelectedLayer(false));
$("#layer-remove").addEventListener("click", removeSelectedLayer);
$("#layer-crop").addEventListener("click", () => {
  if (!selectedLayerId) return;
  cropMode = !cropMode;
  assetStore.list(currentProject.id).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
});
$("#canvas-objects").addEventListener("click", (event) => {
  if (event.target.id !== "canvas-objects" || !selectedLayerId) return;
  selectedLayerId = null;
  assetStore.list(currentProject.id).then((resources) => { renderCanvasObjects(resources); renderLayerPanel(currentProject); });
});
$("#document-canvas").addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("application/x-van-gogh-resource")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
});
$("#document-canvas").addEventListener("drop", async (event) => {
  const resourceId = event.dataTransfer?.getData("application/x-van-gogh-resource");
  if (!resourceId) return;
  event.preventDefault();
  try { await addResourceLayer(resourceId, canvasPoint(event)); }
  catch (error) { showToast(error.message || "No se pudo añadir el recurso al lienzo."); }
});
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
  canvasObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  releaseResourcePreviews();
});

if (!location.hash) location.hash = "#/";
else renderRoute();

assetDatabase.then(() => {
  if (routeDetails().name === "home") renderHome();
}).catch(() => {
  showToast("El navegador no pudo iniciar la biblioteca local de imágenes.");
});
