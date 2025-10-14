import { loadOrDefault, save } from "./save.js";
import { createTripStore } from "./store.js";

const SEARCH_BOX_ENDPOINT = "https://api.mapbox.com/search/searchbox/v1";

function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function renderPlacesList(
    el,
    places,
    allModes,
    { onRemove, onReorder, onModeChange }
) {
    console.log("RERENDERING PLACES");
    el.innerHTML = "";
    let dragStartIndex = null;
    let dragStartId = null;
    places.forEach((p, idx) => {
        const li = document.createElement("li");
        li.className = "place-item";
        li.draggable = true;
        li.dataset.index = String(idx);
        li.dataset.id = p.id;
        let nameSpanContents = `<span class="name-tag">${p.name}</span>`;
        if (p.regionString) {
            nameSpanContents = `
                <span class="name-tag">${p.name}</span>
                <span class="region-tag">${p.regionString}</span>`;
        }

        li.innerHTML = `
            <span class="drag"></span>
            <span class="name">
                ${nameSpanContents}
            </span>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="remove">
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                <path d="M7 12L17 12" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                </path>
                </g>
            </svg>
        `; // todo escape html

        li.querySelector(".remove").addEventListener("click", (e) => {
            e.stopPropagation();
            onRemove(p.id);
        });

        li.addEventListener("dragstart", (e) => {
            console.log("DRAGSTART");
            dragStartIndex = idx;
            dragStartId = p.id;

            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", dragStartId);
            setTimeout(() => {
                li.classList.add("dragging");
                el.classList.add("drag-happening");
                // Remove all <select> tags from el to avoid weird reordering
                el.querySelectorAll(".mode-selector-box").forEach((sel) =>
                    sel.remove()
                );
            }, 10);
        });
        li.addEventListener("dragend", () => {
            console.log("DRAGEND");
            li.classList.remove("dragging");
            el.classList.remove("drag-happening");
            const idsInDomOrder = [...el.querySelectorAll(".place-item")].map(
                (n) => n.dataset.id
            );
            const toIdx = idsInDomOrder.indexOf(dragStartId);

            if (
                dragStartIndex != null &&
                toIdx !== -1 &&
                dragStartIndex !== toIdx
            ) {
                onReorder(dragStartIndex, toIdx);
            } else {
                renderPlacesList(el, places, allModes, {
                    onRemove,
                    onReorder,
                    onModeChange,
                });
            }

            dragStartIndex = null;
            dragStartId = null;
        });

        el.appendChild(li);
        if (0 <= idx && idx + 1 < places.length) {
            // if between two legs
            renderModeSelector(allModes, places, idx, onModeChange, el);
        }
    });
    if (!el._dndBound) {
        el._dndBound = true;

        el.addEventListener("dragover", (e) => {
            e.preventDefault();
            const dragging = el.querySelector(".place-item.dragging");
            if (!dragging) return;

            const items = [
                ...el.querySelectorAll(".place-item:not(.dragging)"),
            ];
            const after = items.find((item) => {
                const rect = item.getBoundingClientRect();
                return e.clientY < rect.top + rect.height / 2;
            });

            if (!after) {
                el.appendChild(dragging);
            } else {
                el.insertBefore(dragging, after);
            }
        });

        el.addEventListener("drop", (e) => {
            e.preventDefault();
        });
    }
}
function renderModeSelector(allModes, places, idx, onModeChange, el) {
    const place1 = places[idx];
    const place2 = places[idx + 1];
    const mode = allModes[idx];
    const container = document.createElement("div");
    const frontText = document.createElement("span");
    const rearText = document.createElement("span");
    frontText.innerText = "⇋";
    rearText.innerText = "⇋";
    const modeSelector = document.createElement("select");
    container.classList.add("mode-selector-box");
    modeSelector.id = idx;
    modeSelector.classList.add("mode-selector");
    modeSelector.innerHTML = `
    <option class="mode-select-option" value="plane" ${
        mode === "plane" ? "selected" : ""
    }>by plane</option>
        <option class="mode-select-option" value="drive" ${
            mode === "drive" ? "selected" : ""
        }>by car</option>
            <option class="mode-select-option" value="walk" ${
                mode === "walk" ? "selected" : ""
            }>on foot</option>
                `;
    modeSelector.addEventListener("change", function () {
        const selectedVal = this.value;
        onModeChange(place1, place2, selectedVal);
    });
    el.appendChild(container);
    container.appendChild(frontText);
    container.appendChild(modeSelector);
}

function renderSearchResults(el, features, { onPick }) {
    el.innerHTML = "";
    if (!features || features.length === 0) {
        el.style.display = "none";
        return;
    }
    features.forEach((f) => {
        const div = document.createElement("div");
        const miniDiv = document.createElement("div");
        const country = f.properties.context.country?.name || undefined;
        const region =
            f.properties.context.place?.name ||
            f.properties.context.region?.name ||
            undefined;
        const regionString = formatRegionString(country, region);

        div.className = "result-item";
        div.textContent =
            f.place_name || f.text || f.properties?.name || "Unknown";
        div.addEventListener("click", () => onPick(f));
        el.appendChild(div);
        if (regionString) {
            miniDiv.className = "result-item-region";
            miniDiv.textContent = regionString;
            div.appendChild(miniDiv);
        }
    });
    el.style.display = "block";
}

export function initUI() {
    const menuEl = document.getElementById("menu");
    const menuHandleEl = document.getElementById("menu-handle");
    const menuHandleTitleEl = document.getElementById("handle-title");
    const titleInput = document.getElementById("trip-title-box");
    const searchInput = document.getElementById("search-box");
    const resultsEl = document.getElementById("search-results");
    const listEl = document.getElementById("places-list");

    const store = createTripStore(loadOrDefault());
    titleInput.value = store.getState().title || "";

    store.subscribe(({ title, places, customModes, allModes }) => {
        renderPlacesList(listEl, places, allModes, {
            onRemove: (id) => store.removePlace(id),
            onReorder: (from, to) => store.movePlace(from, to),
            onModeChange: (place1, place2, mode) => {
                console.log("modes changed", mode);
                store.setCustomMode(place1, place2, mode);
            },
        });
        setHandleTitle(title);
        save({ title: title, places: places, customModes: customModes });
    });

    menuHandleEl.addEventListener("click", () => {
        menuEl.classList.toggle("closed");
    });
    document.addEventListener("click", (event) => {
        if (
            !menuEl.classList.contains("closed") &&
            !menuEl.contains(event.target) &&
            !event.target.classList.contains("result-item") &&
            !event.target.classList.contains("result-item-region")
        ) {
            menuEl.classList.add("closed");
        }
    });

    titleInput.addEventListener("input", (e) => {
        store.setTitle(e.target.value);
    });

    async function geocode(query) {
        const token = mapboxgl?.accessToken;
        if (!token) return [];
        const url = `${GEOCODE_ENDPOINT}/${encodeURIComponent(
            query
        )}.json?access_token=${encodeURIComponent(token)}&limit=5&language=en`;
        try {
            const res = await fetch(url);
            if (!res.ok) return [];
            const json = await res.json();
            return json.features || [];
        } catch {
            return [];
        }
    }

    async function searchBoxPlaces(query) {
        const token = mapboxgl?.accessToken;
        if (!token) return [];

        const url = `${SEARCH_BOX_ENDPOINT}/forward?q=${encodeURIComponent(
            query
        )}&access_token=${encodeURIComponent(token)}&limit=5`;

        try {
            const res = await fetch(url);
            if (!res.ok) return [];
            const json = await res.json();
            console.log(json);
            return json.features || [];
        } catch (err) {
            console.warn("Search Box forward failed:", err);
            return [];
        }
    }

    const runSearch = debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) {
            renderSearchResults(resultsEl, [], { onPick: () => {} });
            return;
        }
        const features = await searchBoxPlaces(q);
        renderSearchResults(resultsEl, features, {
            onPick: (f) => {
                const coords = Array.isArray(f.center)
                    ? f.center
                    : f.geometry?.coordinates ?? null;
                if (!coords) return;

                const country = f.properties.context.country?.name || undefined;
                const region =
                    f.properties.context.place?.name ||
                    f.properties.context.region?.name ||
                    undefined;
                const regionString = formatRegionString(country, region);

                store.addPlace({
                    id: f.id || `${coords[0]},${coords[1]}`,
                    name:
                        f.properties.name_preferred ||
                        f.properties.name ||
                        "Untitled",

                    coords,
                    regionString: regionString,
                });

                resultsEl.style.display = "none";
                resultsEl.innerHTML = "";
                searchInput.value = "";
            },
        });
    }, 250);

    searchInput.addEventListener("input", runSearch);
    document.addEventListener("click", (e) => {
        if (!resultsEl.contains(e.target) && e.target !== searchInput) {
            resultsEl.style.display = "none";
        }
    });
    searchInput.addEventListener("focus", () => {
        if (resultsEl.children.length > 0) resultsEl.style.display = "block";
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !menuEl.classList.contains("closed")) {
            menuEl.classList.toggle("closed");
        }
    });

    function setHandleTitle(title) {
        if (title && title !== "") {
            menuHandleTitleEl.innerText = title;
        } else {
            menuHandleTitleEl.innerText = "Enter a title";
        }
    }

    return store;
}

function formatRegionString(country, region) {
    if (!country && !region) {
        return undefined;
    }
    if (country && region) {
        return `${region}, ${country}`;
    }
    if (!country) {
        return region;
    }
    if (!region) {
        return country;
    }
}
