import { emit } from "./events.js";
import {
    cumulativeMeters,
    pointAtDistance,
    bearing,
    lerpAngle,
} from "./geodesy.js";
import { animateCamera, viewForAllStops, easings } from "./camera.js";

function averageBearingDeg(degArray) {
    if (!degArray?.length) return 0;
    let x = 0,
        y = 0;
    for (const deg of degArray) {
        const r = (deg * Math.PI) / 180;
        x += Math.cos(r);
        y += Math.sin(r);
    }
    const avg = Math.atan2(y, x) * (180 / Math.PI);
    return (avg + 360) % 360;
}

function computeDurationMs(mode, length) {
    const cfg = {
        walk: { base: 2800, scale: 500, ref: 2500, min: 2000, max: 4000 },
        drive: { base: 3000, scale: 2000, ref: 2000, min: 2000, max: 6000 },
        plane: { base: 3000, scale: 400, ref: 3000000, min: 2500, max: 3000 },
        default: { base: 3000, scale: 500, ref: 4000, min: 2000, max: 4000 },
    };
    const c = cfg[mode] ?? cfg.default;

    const dur = c.base + c.scale * Math.log(length / c.ref);
    return Math.max(c.min, Math.min(c.max, dur));
}

function remapClamped(x, x0, x1, y0, y1) {
    const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
    return y0 + (y1 - y0) * t;
}

function driveTuning(lengthMeters) {
    const L0 = 5000; // begin adapting
    const L1 = 80000; // max adaptation

    const zoom = remapClamped(
        lengthMeters,
        L0,
        L1,
        /*near*/ 14.0,
        /*far*/ 11.0
    );
    const lookahead = remapClamped(
        lengthMeters,
        L0,
        L1,
        /*near*/ 3000,
        /*far*/ 10000
    );
    const pitch = remapClamped(lengthMeters, L0, L1, /*near*/ 65, /*far*/ 58);
    const samples = Math.round(
        remapClamped(lengthMeters, L0, L1, /*near*/ 10, /*far*/ 20)
    );

    return { zoom, lookahead, pitch, samples };
}

export function buildRuntimeLegs(legsFC, stopsById, legIdToNames) {
    return legsFC.features.map((f) => {
        const coords = f.geometry.coordinates;
        const cum = cumulativeMeters(coords);
        const length = cum[cum.length - 1];
        const mode = f.properties.mode;
        const id = f.properties.id;
        const { fromName, toName } = legIdToNames.get(id);

        const durationMs = computeDurationMs(mode, length);
        const speedMps = length / (durationMs / 1000);

        return {
            id,
            mode,
            coords,
            cum,
            length,
            durationMs,
            speedMps,
            fromName,
            toName,
        };
    });
}

export function startTour(map, runtimeLegs, opts = {}) {
    const {
        dwellMs = 0,
        lookaheadMetersByMode = {
            walk: 80,
            drive: 300,
            plane: 5000,
            default: 200,
        },
        pitchByMode = { walk: 55, drive: 65, plane: 70, default: 50 },
        zoomByMode = { walk: 16, drive: 14, plane: 6 },
        lookaheadSamplesByMode = { walk: 5, drive: 5, plane: 1, default: 5 },
        bearingSmoothing = 0.03,
        onComplete = () => {},
        startRightAway = false,

        transition = {
            easing: easings.smootherstep,
            minDuration: 400,
            maxDuration: 2000,
            speed: {
                centerMps: 500,
                bearingDps: 180,
                zoomPerSec: 1.8,
                pitchDps: 120,
            },
        },
        allStopsForEndView = [], // array of [lng,lat]
    } = opts;

    const hudFromEl = document.getElementById("hud-route-from");
    const hudToEl = document.getElementById("hud-route-to");
    const hudCenterEl = document.getElementById("hud-route-center");
    const hudRouteEl = document.getElementById("hud-route");
    const btnPlayPauseEl = document.getElementById("btn-play-pause");
    let legIdx = 0;
    let prevBearing = map.getBearing();
    let d = 0;
    let lastTs;
    let waitingToStart = !startRightAway;
    let paused = false;
    let stopped = false;
    let dwellTimer = null;
    let activeCamAnim = null;
    let inTransition = false;
    let requestPause = false;

    function setHUD(fromName, toName) {
        if (hudFromEl && hudToEl) {
            hudFromEl.textContent = fromName;
            hudToEl.textContent = toName;
            hudCenterEl.textContent = "⇀";
        }
    }

    function applyCamera(mode, center, brg) {
        const pitch = pitchByMode[mode] ?? pitchByMode.default;
        const z =
            mode === "plane"
                ? zoomByMode.plane
                : mode === "drive"
                ? zoomByMode.drive
                : zoomByMode.walk;
        map.setCenter(center);
        map.setBearing(brg);
        map.setPitch(pitch);
        map.setZoom(z);
    }

    function finish() {
        if (stopped) return;
        emit("tour-stop");
        stopped = true;
        if (dwellTimer) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
        if (activeCamAnim) {
            activeCamAnim.cancel();
            activeCamAnim = null;
        }

        if (allStopsForEndView?.length) {
            const target = viewForAllStops(map, allStopsForEndView, 120);
            if (target) {
                btnPlayPauseEl.classList.add("disabled");
                activeCamAnim = animateCamera(map, target, {
                    easing: transition.easing,
                    minDuration: transition.minDuration,
                    maxDuration: Math.max(transition.maxDuration, 800),
                    speed: transition.speed,
                });
                activeCamAnim.done.then(() =>
                    btnPlayPauseEl.classList.remove("disabled")
                );
                // we don't need to await this for onComplete
            }
        }
        hudRouteEl.classList.add("closed");

        onComplete();
    }

    if (!runtimeLegs || runtimeLegs.length === 0) {
        finish();
        return {
            pause: () => {},
            resume: () => {},
            stop: () => {
                emit("tour-stop");
                stopped = true;
            },
            isPaused: () => false,
            isRunning: () => false,
            isWaitingToStart: () => false,
            getLegIndex: () => 0,
        };
    }

    async function transitionToLegStart(idx) {
        const leg = runtimeLegs[idx];
        const start = leg.coords[0];
        const next = leg.coords[Math.min(1, leg.coords.length - 1)];
        const startBearing = bearing(start, next);

        const target = {
            center: { lng: start[0], lat: start[1] },
            zoom:
                leg.mode === "plane"
                    ? zoomByMode.plane
                    : leg.mode === "drive"
                    ? zoomByMode.drive
                    : zoomByMode.walk,
            pitch: pitchByMode[leg.mode] ?? pitchByMode.default,
            bearing: startBearing,
        };

        if (leg.mode === "drive") {
            // band aid for making long drives less ugly
            const t = driveTuning(leg.length);
            target.zoom = t.zoom;
            target.pitch = t.pitch;
        }

        if (activeCamAnim) {
            activeCamAnim.cancel();
            activeCamAnim = null;
        }
        inTransition = true;
        console.log("IN TRANSITION");
        activeCamAnim = animateCamera(map, target, {
            easing: transition.easing,
            minDuration: transition.minDuration,
            maxDuration: transition.maxDuration,
            speed: transition.speed,
        });
        await activeCamAnim.done;
        console.log("CAM ANIM DONE");
        if (requestPause) {
            console.log("PAUSE REQUEST DETECTED");
            emit("tour-stop");
            paused = true;
            requestPause = false;
        }
        console.log("NOT IN TRANSITION");
        inTransition = false;
        activeCamAnim = null;

        prevBearing = map.getBearing();
    }

    setHUD(runtimeLegs[0].fromName, runtimeLegs[0].toName);

    if (!startRightAway) {
        waitingToStart = true;
        transitionToLegStart(0).then(() => {
            btnPlayPauseEl.classList.remove("disabled");
            hudRouteEl.classList.remove("closed");
        });
    } else {
        paused = true;
        emit("tour-start");
        transitionToLegStart(0).then(() => {
            paused = false;
            btnPlayPauseEl.classList.remove("disabled");
            hudRouteEl.classList.remove("closed");
        });
    }

    function advanceToNextLeg() {
        legIdx++;
        d = 0;
        if (legIdx >= runtimeLegs.length) {
            finish();
            return;
        }
        const leg = runtimeLegs[legIdx];
        console.log(leg);
        setHUD(leg.fromName, leg.toName);
    }

    function frame(ts) {
        if (stopped) return;
        if (paused || waitingToStart) {
            requestAnimationFrame(frame);
            return;
        }
        if (legIdx >= runtimeLegs.length) return;

        if (lastTs === undefined) lastTs = ts;
        const leg = runtimeLegs[legIdx];
        const dt = ts - lastTs;
        lastTs = ts;

        const p = pointAtDistance(leg.coords, leg.cum, d);
        d = Math.min(leg.length, d + leg.speedMps * (dt / 1000));
        let lookaheadMeters =
            lookaheadMetersByMode[leg.mode] ?? lookaheadMetersByMode.default;
        let sampleCount = Math.max(
            1,
            lookaheadSamplesByMode[leg.mode] ?? lookaheadSamplesByMode.default
        );
        if (leg.mode === "drive") {
            const t = driveTuning(leg.length);
            lookaheadMeters = t.lookahead;
            sampleCount = t.samples;
        }

        // sample evenly between (d, d + lookaheadMeters]
        const bearings = [];
        for (let i = 1; i <= sampleCount; i++) {
            const frac = i / sampleCount;
            const di = Math.min(leg.length, d + lookaheadMeters * frac);
            const qi = pointAtDistance(leg.coords, leg.cum, di);
            bearings.push(bearing(p, qi));
        }
        const targetBrg = averageBearingDeg(bearings);
        prevBearing = lerpAngle(
            prevBearing,
            targetBrg,
            1 - Math.pow(1 - bearingSmoothing, dt / 16.67)
        );

        applyCamera(leg.mode, p, prevBearing);

        if (d >= leg.length - 0.01) {
            if (dwellTimer) clearTimeout(dwellTimer);
            dwellTimer = setTimeout(async () => {
                advanceToNextLeg();
                if (legIdx < runtimeLegs.length) {
                    await transitionToLegStart(legIdx);
                    lastTs = undefined;
                    requestAnimationFrame(frame);
                }
            }, dwellMs);
            return;
        }

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

    return {
        pause: () => {
            if (inTransition) {
                requestPause = true;
                console.log("PAUSE REQUESTED");
            } else {
                emit("tour-stop");
                paused = true;
            }
        },
        resume: () => {
            if (paused) {
                emit("tour-start");
                paused = false;
                prevBearing = map.getBearing();
                lastTs = undefined;
            } else if (waitingToStart) {
                emit("tour-start");
                waitingToStart = false;
                prevBearing = map.getBearing();
                lastTs = undefined;
            }
        },
        stop: () => {
            emit("tour-stop");
            stopped = true;
            if (dwellTimer) {
                clearTimeout(dwellTimer);
                dwellTimer = null;
            }
            if (activeCamAnim) {
                activeCamAnim.cancel();
            }
        },
        isPaused: () => paused,
        isRunning: () => !stopped,
        isWaitingToStart: () => waitingToStart,
        getLegIndex: () => legIdx,
    };
}
