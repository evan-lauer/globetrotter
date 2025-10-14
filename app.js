import { initUI } from "./ui.js";
import { getDirections } from "./routing.js";
import { greatCircle } from "./geo.js";
import { buildRuntimeLegs, startTour } from "./tour.js";
import { haversine } from "./geodesy.js";
import {
    animateCamera,
    viewForAllStops,
    easings,
    wideWorldView,
} from "./camera.js";

const MAPBOX_TOKEN = "I'll add this soon";
mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-v9",
    projection: "globe",
    antialias: true,
    center: [2, 46],
    zoom: 3.2,
    pitch: 0,
    bearing: 0,
});
map.addControl(
    new mapboxgl.NavigationControl({ visualizePitch: true }),
    "top-right"
);

const store = initUI();

let isMapLoaded = false;

function legFeature(id, mode, coordinates) {
    return {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { id, mode },
    };
}

export function defaultModeResolver(a, b) {
    const dist = haversine(a.coords, b.coords);
    if (dist > 1_000_000) return "plane";
    if (dist > 12_500) return "drive";
    return "walk";
}

async function buildLegsFromPlaces(token, places, allModes) {
    const features = [];
    for (let i = 0; i < places.length - 1; i++) {
        const from = places[i];
        const to = places[i + 1];
        const mode = allModes[i];

        const a = from.coords;
        const b = to.coords;

        try {
            if (mode === "plane") {
                features.push(
                    legFeature(`leg-${i}`, mode, greatCircle(a, b, 192))
                );
            } else if (mode === "drive") {
                features.push(
                    legFeature(
                        `leg-${i}`,
                        mode,
                        await getDirections(token, "driving", a, b)
                    )
                );
            } else if (mode === "walk") {
                features.push(
                    legFeature(
                        `leg-${i}`,
                        mode,
                        await getDirections(token, "walking", a, b)
                    )
                );
            } else {
                features.push(legFeature(`leg-${i}`, mode, [a, b]));
            }
        } catch (e) {
            console.warn(`Leg ${i} failed (${mode}); fallback to straight`, e);
            features.push(legFeature(`leg-${i}`, mode, greatCircle(a, b, 192)));
        }
    }
    return { type: "FeatureCollection", features };
}

function legIdToNamesFromPlaces(places) {
    const m = new Map();
    for (let i = 0; i < places.length - 1; i++) {
        m.set(`leg-${i}`, {
            fromName: places[i].name,
            toName: places[i + 1].name,
        });
    }
    return m;
}

let tour = null;
let pendingRebuild = false;

async function rebuildFromStoreNow(startRightAway = false) {
    const { places, allModes } = store.getState();

    const stopsFC = {
        type: "FeatureCollection",
        features: places.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: p.coords },
            properties: { id: p.id, name: p.name },
        })),
    };
    const stopsSrc = map.getSource("stops");
    if (stopsSrc) stopsSrc.setData(stopsFC);

    console.log("right before rebuild, modes are ", allModes);
    const legsFC = await buildLegsFromPlaces(MAPBOX_TOKEN, places, allModes);
    const legsSrc = map.getSource("legs");
    if (legsSrc) legsSrc.setData(legsFC);

    const legNames = legIdToNamesFromPlaces(places);
    const runtimeLegs = buildRuntimeLegs(legsFC, null, legNames);

    if (tour?.isRunning()) {
        console.log("stopping????");
        tour.stop();
    }
    tour = null;

    if (!runtimeLegs.length) return;

    tour = startTour(map, runtimeLegs, {
        onComplete: () => {
            if (pendingRebuild) {
                pendingRebuild = false;
                setTimeout(() => {
                    rebuildFromStoreNow().catch(console.error);
                }, 0);
            }
        },
        startRightAway: startRightAway,
        allStopsForEndView: stopsFC.features.map(
            (stop) => stop.geometry.coordinates
        ),
    });
}

const offlineBugEl = document.getElementById("offline-bug");
const menuEl = document.getElementById("menu");
const btnPlayPause = document.getElementById("btn-play-pause");
const btnRefresh = document.getElementById("btn-refresh");

const hudEl = document.getElementById("hud");
window.addEventListener("offline", onOffline);
window.addEventListener("online", onOnline);
if (window.navigator.onLine === false) onOffline();

function requestRebuildFromStore(startRightAway = false) {
    const hudRouteEl = document.getElementById("hud-route");
    hudRouteEl.classList.add("closed");
    btnPlayPause.classList.add("disabled");
    if (
        (tour && tour.isRunning() && !tour.isWaitingToStart()) ||
        !isMapLoaded ||
        window.navigator.onLine === false
    ) {
        console.log("tried but NOT REBUILDING");

        pendingRebuild = true;
    } else {
        console.log("REBUILDING");
        if (pendingRebuild) {
            pendingRebuild = false;
        }
        rebuildFromStoreNow(startRightAway).catch(console.error);
    }
}

map.on("load", async () => {
    console.log("LOADED!!");
    isMapLoaded = true;
    if (window.navigator.onLine) {
        const btnPlayPause = document.getElementById("btn-play-pause");
        btnPlayPause.classList.remove("disabled");
    }
    map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "space-color": "rgb(11, 11, 25)",
        "horizon-blend": 0.04,
    });
    map.setLight({
        anchor: "viewport",
        intensity: 0.5,
        position: [1.3, 210, 30],
    });

    map.addSource("stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("legs", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
        id: "legs-layer",
        type: "line",
        source: "legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                2,
                8,
                5,
                12,
                7.5,
            ],
            "line-color": [
                "match",
                ["get", "mode"],
                "plane",
                "#ff5a5f",
                "drive",
                "#00b3ff",
                "walk",
                "#2ecc40",
                /* default */ "#cccccc",
            ],
            "line-opacity": 0.95,
        },
    });

    map.addLayer({
        id: "stops-layer",
        type: "circle",
        source: "stops",
        paint: {
            "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                3.5,
                8,
                6.5,
                12,
                8.5,
            ],
            "circle-color": "#ffcc00",
            "circle-stroke-color": "#222",
            "circle-stroke-width": 1.25,
        },
    });

    map.addLayer({
        id: "stops-labels",
        type: "symbol",
        source: "stops",
        layout: {
            "text-field": ["get", "name"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13],
            "text-offset": [0, 1.1],
            "text-anchor": "top",
        },
        paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1,
        },
    });

    requestRebuildFromStore();
});

store.subscribe(({ places, title }) => {
    // whenever title/places change, we request a rebuild
    // (rebuild will be deferred if a tour is currently running)
    console.log("subscription fired");
    requestRebuildFromStore();
    if (places.length === 1) {
        transitionToWideView();
    } else if (places.length === 0) {
        transitionToWideView(wideWorldView());
    }
});

function transitionToWideView(targetView = null) {
    const transition = {
        easing: easings.smootherstep,
        minDuration: 400,
        maxDuration: 2000,
        speed: {
            centerMps: 500,
            bearingDps: 180,
            zoomPerSec: 1.8,
            pitchDps: 120,
        },
    };
    const coordsList = store.getState().places.map((place) => place.coords);
    let target;
    if (targetView) {
        target = targetView;
    } else {
        target = viewForAllStops(map, coordsList, 120);
    }
    let offsets = 0;
    console.log("CURR ZOOM ", map.getZoom());
    if (target) {
        animateCamera(map, target, {
            easing: transition.easing,
            minDuration: transition.minDuration,
            maxDuration: Math.max(transition.maxDuration, 800),
            speed: transition.speed,
            offsets: offsets,
        });
        // we don't need to await this for onComplete
    }
}

btnPlayPause.addEventListener("click", () => {
    if (
        !tour ||
        window.navigator.onLine === false ||
        btnPlayPause.classList.contains("disabled")
    )
        return;
    if (tour.isPaused() || tour.isWaitingToStart()) {
        tour.resume();
    } else if (!tour.isRunning()) {
        pendingRebuild = false;
        rebuildFromStoreNow(true).catch(console.error);
    } else {
        tour.pause();
    }
});
btnRefresh.addEventListener("click", () => {
    if (!tour || window.navigator.onLine === false) return;
    rebuildFromStoreNow(false).catch(console.error);
});

document.addEventListener("tour-start", () => setButtonStateAndWarn("play"));
document.addEventListener("tour-stop", () => setButtonStateAndWarn("pause"));

function setButtonStateAndWarn(action) {
    if (action === "pause") {
        if (btnPlayPause.classList.contains("paused")) {
            console.warn("Button state mismatch");
        } else {
            btnPlayPause.classList.toggle("paused");
            btnPlayPause.innerHTML = `<span id='itext'>▶</span>`;
        }
    } else if (action === "play") {
        if (!btnPlayPause.classList.contains("paused")) {
            console.warn("Button state mismatch");
        } else {
            btnPlayPause.classList.toggle("paused");
            btnPlayPause.innerHTML = `<span id='itext'>⏸</span>`;
        }
    } else {
        throw new TypeError("action should be play or pause");
    }
}

if (!window.navigator.onLine) {
    offlineBugEl.classList.remove("closed");
    hudEl.classList.add("closed");
}

function onOffline() {
    btnPlayPause.classList.add("disabled");
    // if tour exists, stop it
    if (tour && tour.isRunning()) {
        tour.stop();
    }
    // zoom to global view
    if (isMapLoaded) {
        transitionToWideView(wideWorldView());
    } else {
        map.on("load", () => {
            // if it loads later and we're still offline, zoom to global view
            if (window.navigator.onLine === false) {
                transitionToWideView(wideWorldView());
            }
        });
    }
    menuEl.classList.add("closed");
    hudEl.classList.add("closed");
    offlineBugEl.classList.remove("closed");
}

function onOnline() {
    btnPlayPause.classList.remove("disabled");
    // if offline bug open, close it
    hudEl.classList.remove("closed");
    offlineBugEl.classList.add("closed");
    // change store trivially to request rebuild
    store.setTitle(store.getState().title);
}
