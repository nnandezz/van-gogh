"use strict";

const iconMarkup = {
  mark: '<path d="M12 2.8c2.1 3.4 6.8 5.1 6.8 10.1a6.8 6.8 0 1 1-13.6 0C5.2 8 9.9 6.2 12 2.8Z"/><path d="M9 15.5c.4 1.4 1.4 2.1 2.8 2.1"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h8a6 6 0 0 1 0 12" transform="translate(0 -6)"/>',
  redo: '<path d="m15 7 4.5 4.5L15 16"/><path d="M19 11.5h-8a6 6 0 0 0 0 12" transform="translate(0 -6)"/>',
  upload: '<path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  crop: '<path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/>',
  resize: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6m10 10-6-6"/><path d="M14 4h6v6M4 14v6h6"/>',
  rotate: '<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 3v5h5M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 21v-5h-5"/>',
  text: '<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>',
  filters: '<path d="M4 5h16M7 12h10m-7 7h4"/><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="19" r="1.5"/>',
  adjust: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/><path d="M8 8h8v8H8z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};

const toolNames = {
  crop: "Recortar",
  resize: "Redimensionar",
  rotate: "Rotación",
  text: "Texto",
  filters: "Filtros",
  adjustments: "Ajustes de imagen",
};

const shell = document.querySelector("#app-shell");
const imageInput = document.querySelector("#image-input");
const canvasImage = document.querySelector("#canvas-image");
const imageStage = document.querySelector("#image-stage");
const emptyState = document.querySelector("#empty-state");
const dropOverlay = document.querySelector("#drop-overlay");
const exportButton = document.querySelector("#export-button");
const zoomValue = document.querySelector("#zoom-value");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomInButton = document.querySelector("#zoom-in");
const projectName = document.querySelector("#project-name");
const canvasMeta = document.querySelector("#canvas-meta");
const panelTitle = document.querySelector("#panel-title");
const propertyContent = document.querySelector("#property-content");
const announcements = document.querySelector("#announcements");

let currentImage = null;
let pendingImageUrl = null;
let zoom = 100;
let activeTool = null;
let dragDepth = 0;
let loadSequence = 0;

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup[name] || ""}</svg>`;
}

document.querySelectorAll("[data-icon]").forEach((element) => {
  const name = element.dataset.icon;
  element.innerHTML = icon(name, name === "mark" ? 21 : 18);
});

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateZoom(nextZoom) {
  zoom = Math.min(200, Math.max(25, nextZoom));
  zoomValue.textContent = `${zoom}%`;
  canvasImage.style.setProperty("--image-zoom", String(zoom / 100));
  zoomOutButton.disabled = zoom <= 25;
  zoomInButton.disabled = zoom >= 200;
}

function updateProperties() {
  if (!activeTool) {
    panelTitle.textContent = "Propiedades";
    propertyContent.className = "property-empty default-property";
    propertyContent.innerHTML = `<div class="property-icon">${icon("info", 19)}</div><p>Selecciona una herramienta para ver sus opciones.</p>`;
    return;
  }

  panelTitle.textContent = toolNames[activeTool];
  propertyContent.className = "property-empty";
  propertyContent.innerHTML = `<div class="property-icon">${icon(activeTool === "adjustments" ? "adjust" : activeTool, 19)}</div><p>${currentImage ? "Esta herramienta estará disponible en una próxima fase." : "Importa una imagen para preparar esta herramienta."}</p><span class="coming-soon">${currentImage ? "EN DESARROLLO" : "SIN IMAGEN"}</span>`;
}

function updateImageView(image) {
  currentImage = image;
  canvasImage.src = image.url;
  canvasImage.alt = image.name;
  canvasImage.style.setProperty("--image-zoom", String(zoom / 100));
  imageStage.hidden = false;
  emptyState.hidden = true;
  exportButton.disabled = false;
  projectName.innerHTML = `<span class="project-dot"></span>`;
  const filename = document.createElement("span");
  filename.textContent = image.name;
  projectName.append(filename);
  canvasMeta.innerHTML = `${icon("image", 14)}<span>${image.width} × ${image.height}</span><span class="meta-divider">·</span><span>${formatBytes(image.size)}</span>`;
  updateProperties();
  announcements.textContent = `Imagen cargada: ${image.name}, ${image.width} por ${image.height} píxeles.`;
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    announcements.textContent = "El archivo seleccionado no es una imagen compatible.";
    return;
  }

  const sequence = ++loadSequence;
  if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
  const url = URL.createObjectURL(file);
  pendingImageUrl = url;
  const probe = new Image();

  probe.onload = () => {
    if (sequence !== loadSequence) {
      URL.revokeObjectURL(url);
      return;
    }
    if (currentImage) URL.revokeObjectURL(currentImage.url);
    pendingImageUrl = null;
    updateZoom(100);
    updateImageView({
      name: file.name,
      url,
      width: probe.naturalWidth,
      height: probe.naturalHeight,
      size: file.size,
    });
  };

  probe.onerror = () => {
    URL.revokeObjectURL(url);
    if (pendingImageUrl === url) pendingImageUrl = null;
    if (sequence === loadSequence) announcements.textContent = "No se pudo abrir esta imagen.";
  };
  probe.src = url;
}

function openFilePicker() {
  imageInput.click();
}

document.querySelector("#import-top").addEventListener("click", openFilePicker);
document.querySelector("#import-empty").addEventListener("click", openFilePicker);
imageInput.addEventListener("change", (event) => {
  loadImage(event.target.files?.[0]);
  imageInput.value = "";
});

exportButton.addEventListener("click", () => {
  if (!currentImage) return;
  const download = document.createElement("a");
  download.href = currentImage.url;
  download.download = currentImage.name;
  document.body.append(download);
  download.click();
  download.remove();
});

zoomOutButton.addEventListener("click", () => updateZoom(zoom - 10));
zoomInButton.addEventListener("click", () => updateZoom(zoom + 10));
document.querySelector("#zoom-reset").addEventListener("click", () => updateZoom(100));

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTool = button.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    updateProperties();
  });
});

shell.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
});

shell.addEventListener("dragover", (event) => event.preventDefault());

shell.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});

shell.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  loadImage(event.dataTransfer.files[0]);
});

window.addEventListener("pagehide", () => {
  if (currentImage) URL.revokeObjectURL(currentImage.url);
  if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
});
