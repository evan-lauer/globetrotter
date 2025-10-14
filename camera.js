import { haversine } from "./geodesy.js";

export const easings = {
    linear: (t) => t,
    easeInOutCubic: (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    smootherstep: (t) => t * t * t * (t * (6 * t - 15) + 10),
};

function lerp(a, b, t) {
    return a + (b - a) * t;
}
function lerpAngleDeg(a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
}
function lerpLng(a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * t;
}

export function wideWorldView() {
    return { center: { lat: 0, lng: 0 }, zoom: 2, pitch: 0, bearing: 0 };
}

export function viewForAllStops(map, coords, padding = 80) {
    if (!coords?.length) return null;
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const sw = [Math.min(...lons), Math.min(...lats)];
    const ne = [Math.max(...lons), Math.max(...lats)];
    const cam = map.cameraForBounds([sw, ne], { padding });
    return cam
        ? {
              center: cam.center,
              zoom: Math.min(cam.zoom, 8),
              pitch: cam.pitch ?? 0,
              bearing: cam.bearing ?? 0,
          }
        : null;
}

export function animateCamera(map, target, options = {}) {
    const {
        duration,
        speed = {},
        minDuration = 450,
        maxDuration = 2000,
        easing = easings.smootherstep,
        offsets = 0,
        animateCenter = true,
        animateBearing = true,
        animatePitch = true,
        animateZoom = true,
    } = options;

    const ease =
        typeof easing === "function"
            ? { center: easing, bearing: easing, pitch: easing, zoom: easing }
            : {
                  center: easing.center ?? easings.smootherstep,
                  bearing: easing.bearing ?? easings.smootherstep,
                  pitch: easing.pitch ?? easings.smootherstep,
                  zoom: easing.zoom ?? easings.smootherstep,
              };

    const offAll = typeof offsets === "number" ? offsets : 0;
    const off =
        typeof offsets === "object"
            ? {
                  center: offsets.centerMs ?? offAll,
                  bearing: offsets.bearingMs ?? offAll,
                  pitch: offsets.pitchMs ?? offAll,
                  zoom: offsets.zoomMs ?? offAll,
              }
            : { center: offAll, bearing: offAll, pitch: offAll, zoom: offAll };

    console.log(off);

    const startCenter = map.getCenter();
    const startZoom = map.getZoom();
    const startPitch = map.getPitch();
    const startBear = map.getBearing();

    const endCenter = target.center ?? startCenter;
    const endZoom = target.zoom ?? startZoom;
    const endPitch = target.pitch ?? startPitch;
    const endBear = target.bearing ?? startBear;

    let dur = duration;
    if (dur == null) {
        const centerDist = animateCenter
            ? haversine(
                  [startCenter.lng, startCenter.lat],
                  [endCenter.lng, endCenter.lat]
              )
            : 0;
        const centerTime = speed.centerMps
            ? (centerDist / speed.centerMps) * 1000
            : 0;

        const bearingDelta = animateBearing
            ? Math.abs(((endBear - startBear + 540) % 360) - 180)
            : 0;
        const bearingTime = speed.bearingDps
            ? (bearingDelta / speed.bearingDps) * 1000
            : 0;

        const pitchDelta = animatePitch ? Math.abs(endPitch - startPitch) : 0;
        const pitchTime = speed.pitchDps
            ? (pitchDelta / speed.pitchDps) * 1000
            : 0;

        const zoomDelta = animateZoom ? Math.abs(endZoom - startZoom) : 0;
        const zoomTime = speed.zoomPerSec
            ? (zoomDelta / speed.zoomPerSec) * 1000
            : 0;

        dur = Math.max(
            centerTime,
            bearingTime,
            pitchTime,
            zoomTime,
            minDuration
        );
        dur = Math.min(Math.max(dur, minDuration), maxDuration);
    }

    function norm(elapsedMs, offsetMs) {
        const denom = Math.max(1, dur - Math.max(0, offsetMs));
        return Math.max(
            0,
            Math.min(1, (elapsedMs - Math.max(0, offsetMs)) / denom)
        );
    }

    let rafId = null;
    let canceled = false;
    const t0 = performance.now();

    const done = new Promise((resolve) => {
        const step = (tNow) => {
            if (canceled) return resolve(false);

            const elapsed = tNow - t0;
            const t = Math.max(0, Math.min(1, elapsed / dur));

            const tc = ease.center(norm(elapsed, off.center));
            const tb = ease.bearing(norm(elapsed, off.bearing));
            const tp = ease.pitch(norm(elapsed, off.pitch));
            const tz = ease.zoom(norm(elapsed, off.zoom));

            const lng = animateCenter
                ? lerpLng(startCenter.lng, endCenter.lng, tc)
                : startCenter.lng;
            const lat = animateCenter
                ? lerp(startCenter.lat, endCenter.lat, tc)
                : startCenter.lat;
            const brg = animateBearing
                ? lerpAngleDeg(startBear, endBear, tb)
                : startBear;
            const pit = animatePitch
                ? lerp(startPitch, endPitch, tp)
                : startPitch;
            const z = animateZoom ? lerp(startZoom, endZoom, tz) : startZoom;

            map.setCenter([lng, lat]);
            map.setBearing(brg);
            map.setPitch(pit);
            map.setZoom(z);

            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                resolve(true);
            }
        };
        rafId = requestAnimationFrame(step);
    });

    return {
        cancel() {
            if (rafId != null) cancelAnimationFrame(rafId);
            canceled = true;
        },
        done,
        duration: dur,
    };
}
