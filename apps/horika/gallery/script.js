// Load images.json and horikan.json, then render the gallery.
(function () {
  const IMAGES_JSON = "images.json";
  const HORIKAN_JSON = "horikan.json";

  function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function setFeatured(src, imagesList, horikanInfo) {
    const featured = document.getElementById("featured");
    const img = document.getElementById("featuredImg");
    if (!img || !featured) return;

    img.src = `images/${src}`;
    img.alt = src
      .replace(/[-_0-9]+/g, " ")
      .replace(/\.(heic|avif|jpe?g|png|webp|gif)$/i, "")
      .trim();

    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio >= 1) {
        featured.classList.add("hero--cover");
        img.classList.add("cover");
      } else {
        featured.classList.remove("hero--cover");
        img.classList.remove("cover");
      }
    };

    featured.setAttribute("data-src", src);
    // Determine horikan metadata for this image (match by filename)
    let itemMeta = null;
    if (Array.isArray(imagesList)) {
      itemMeta = imagesList.find((it) => (it.file || it) === src) || null;
    }

    // Ensure a lightbox exists for the featured image so clicking it opens the same UI.
    ensureLbRoot();
    createOrUpdateFeaturedLightbox(src, itemMeta, horikanInfo);

    // Make the featured image act like a link to the featured lightbox (fragment target)
    img.style.cursor = "pointer";
    // avoid adding multiple listeners if setFeatured is called multiple times
    img.replaceWith(img.cloneNode(true));
    const newImg = document.getElementById("featuredImg");
    if (newImg) {
      newImg.addEventListener("click", () => {
        location.hash = "lb-featured";
      });
    }
  }

  function ensureLbRoot() {
    let lbRoot = document.getElementById("lb-root");
    if (!lbRoot) {
      lbRoot = document.createElement("div");
      lbRoot.id = "lb-root";
      document.body.insertBefore(lbRoot, document.body.firstChild);
    }
    return lbRoot;
  }

  function createOrUpdateFeaturedLightbox(name, itemMeta, horikanInfo) {
    const lbRoot = ensureLbRoot();
    const existing = document.getElementById("lb-featured");
    const src = `images/${name}`;

    // If overlay exists, update the background image and info
    if (existing) {
      const imgSpan = existing.querySelector(".lb-image");
      if (imgSpan) imgSpan.style.backgroundImage = `url('${src}')`;
      const titleEl = existing.querySelector("#lb-title-featured");
      const bioEl = existing.querySelector("#lb-bio-featured");
      if (titleEl) {
        if (itemMeta && itemMeta.horikan) {
          if (horikanInfo && horikanInfo.link) {
            titleEl.innerHTML = `<a href="${
              horikanInfo.link
            }" target="_blank" rel="noopener noreferrer">${escapeHtml(
              itemMeta.horikan || horikanInfo.name || ""
            )}</a>`;
          } else {
            titleEl.textContent = itemMeta.horikan || horikanInfo.name || "";
          }
        } else {
          titleEl.textContent = (horikanInfo && horikanInfo.name) || "";
        }
      }
      if (bioEl) bioEl.textContent = (horikanInfo && horikanInfo.bio) || "";
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = `lb-featured`;
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", `lb-title-featured`);

    const backdrop = document.createElement("a");
    backdrop.className = "lightbox-backdrop";
    backdrop.href = "#gallery-anchor";
    backdrop.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "lb-panel";

    const imgSpan = document.createElement("span");
    imgSpan.className = "lb-image";
    imgSpan.style.backgroundImage = `url('${src}')`;
    imgSpan.setAttribute("aria-hidden", "true");

    const info = document.createElement("div");
    info.className = "lb-info";

    const titleEl = document.createElement("h3");
    titleEl.id = `lb-title-featured`;
    // Compose title: prefer per-image horikan, fallback to global horikanInfo
    if (itemMeta && itemMeta.horikan) {
      if (horikanInfo && horikanInfo.link) {
        const a = document.createElement("a");
        a.href = horikanInfo.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = itemMeta.horikan || horikanInfo.name || "";
        titleEl.appendChild(a);
      } else {
        titleEl.textContent = itemMeta.horikan || horikanInfo.name || "";
      }
    } else {
      titleEl.textContent = (horikanInfo && horikanInfo.name) || "";
    }

    const bioEl = document.createElement("p");
    bioEl.id = "lb-bio-featured";
    bioEl.textContent = (horikanInfo && horikanInfo.bio) || "";

    info.appendChild(titleEl);
    info.appendChild(bioEl);

    const closeLink = document.createElement("a");
    closeLink.className = "lightbox-close";
    closeLink.href = "#gallery-anchor";
    closeLink.textContent = "Close";

    panel.appendChild(imgSpan);
    panel.appendChild(info);
    panel.appendChild(closeLink);

    overlay.appendChild(backdrop);
    overlay.appendChild(panel);

    lbRoot.appendChild(overlay);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function renderGallery(items, horikanInfo) {
    const gallery = document.getElementById("gallery");
    if (!gallery) return;
    gallery.innerHTML = "";

    // ensure a root container near top of document for overlays so :target anchors don't jump to page end
    let lbRoot = document.getElementById("lb-root");
    if (!lbRoot) {
      lbRoot = document.createElement("div");
      lbRoot.id = "lb-root";
      // insert as first child of body
      document.body.insertBefore(lbRoot, document.body.firstChild);
    }

    items.forEach((item, idx) => {
      const name = item.file || item;
      const horikan = item.horikan || (horikanInfo && horikanInfo.name) || "";

      const id = `lb-${idx}`;
      const container = document.createElement("div");
      container.className = "gallery-item";

      // hidden checkbox toggle
      // thumbnail label (clicking opens the lightbox via the checkbox)
      // thumbnail link (clicking sets the fragment to #lb-<idx> which triggers :target)
      const thumbAnchor = document.createElement("a");
      thumbAnchor.href = `#lb-${idx}`;
      thumbAnchor.className = "gallery-thumb";

      const thumbImg = document.createElement("img");
      thumbImg.src = `images/${name}`;
      thumbImg.alt = name
        .replace(/[-_0-9]+/g, " ")
        .replace(/\.(heic|avif|jpe?g|png|webp|gif)$/i, "")
        .trim();
      thumbImg.loading = "lazy";
      thumbImg.decoding = "async";
      thumbAnchor.appendChild(thumbImg);

      // Create a :target-based lightbox element (use a DIV as the target to avoid nested anchors)
      const overlay = document.createElement("div");
      overlay.id = `lb-${idx}`;
      overlay.className = "lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", `lb-title-${idx}`);

      // backdrop link covers the overlay and acts as a click-to-close control
      const backdrop = document.createElement("a");
      backdrop.className = "lightbox-backdrop";
      backdrop.href = "#gallery-anchor";
      backdrop.setAttribute("aria-hidden", "true");

      const panel = document.createElement("div");
      panel.className = "lb-panel";

      const imgSpan = document.createElement("span");
      imgSpan.className = "lb-image";
      imgSpan.style.backgroundImage = `url('images/${name}')`;
      imgSpan.setAttribute("aria-hidden", "true");

      const info = document.createElement("div");
      info.className = "lb-info";

      const titleEl = document.createElement("h3");
      titleEl.id = `lb-title-${idx}`;
      const titleText = horikan || (horikanInfo && horikanInfo.name) || "";

      // If a horikan link is provided, make the horikan name itself a link.
      if (horikanInfo && horikanInfo.link) {
        const titleLink = document.createElement("a");
        titleLink.href = horikanInfo.link;
        titleLink.target = "_blank";
        titleLink.rel = "noopener noreferrer";
        titleLink.textContent =
          titleText || (horikanInfo && horikanInfo.name) || "the Horikan";
        titleEl.appendChild(titleLink);
      } else {
        titleEl.textContent = titleText;
      }

      const bioEl = document.createElement("p");
      bioEl.textContent = (horikanInfo && horikanInfo.bio) || "";

      info.appendChild(titleEl);
      info.appendChild(bioEl);

      const closeLink = document.createElement("a");
      closeLink.className = "lightbox-close";
      closeLink.href = "#gallery-anchor";
      closeLink.textContent = "Close";

      panel.appendChild(imgSpan);
      panel.appendChild(info);
      panel.appendChild(closeLink);

      overlay.appendChild(backdrop);
      overlay.appendChild(panel);

      container.appendChild(thumbAnchor);
      // append overlay into lb-root container (top of document)
      lbRoot.appendChild(overlay);

      gallery.appendChild(container);
    });
  }

  async function loadJson(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      // console.warn(`Failed to load ${path}:`, err);
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const [imagesData, horikanData] = await Promise.all([
      loadJson(IMAGES_JSON),
      loadJson(HORIKAN_JSON),
    ]);

    // imagesData is expected to be an array of objects { file, horikan }
    let images = [];
    if (Array.isArray(imagesData) && imagesData.length) {
      images = imagesData;
    } else if (Array.isArray(window.files) && window.files.length) {
      // fallback to global files array (legacy inline)
      images = window.files.map((f) => ({
        file: f,
        horikan: (horikanData && horikanData.name) || "",
      }));
    } else {
      // nothing to show
      return;
    }

    const filenames = images.map((i) => i.file || i);
    const featuredFile = pickRandom(filenames);
    if (featuredFile) setFeatured(featuredFile, images, horikanData);

    // shuffle
    const shuffled = images.slice().sort(() => Math.random() - 0.5);
    renderGallery(shuffled, horikanData);
  });
})();
