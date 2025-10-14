import { defaultModeResolver } from "./app.js";

export function createTripStore(initial = {}) {
    let state = {
        title: initial.title || "",
        places: Array.isArray(initial.places) ? initial.places.slice() : [],
        customModes: initial.customModes || {}, // This object is `${id1} ${id2}` -> mode ('plane' | 'drive' | 'walk'), it will sync with localStorage
        allModes: [],
    };

    const subs = new Set();
    computeAllModes();

    function notify() {
        console.log(state.customModes);
        console.log(state.places);
        for (const fn of subs) fn(getState());
    }

    function computeAllModes() {
        // check if custom mode is defined
        // otherwise compute mode manually
        if (state.places.length < 2) {
            state.allModes = [];
            return;
        }
        const newAllModes = Array(state.places.length - 1);
        for (let i = 0; i < state.places.length - 1; i++) {
            const key1 = `${state.places[i].id} ${state.places[i + 1].id}`;
            const key2 = `${state.places[i + 1].id} ${state.places[i].id}`;

            if (state.customModes[key1]) {
                // custom mode is defined, so add to list
                newAllModes[i] = state.customModes[key1];
            } else if (state.customModes[key2]) {
                newAllModes[i] = state.customModes[key2];
            } else {
                // compute mode
                newAllModes[i] = defaultModeResolver(
                    state.places[i],
                    state.places[i + 1]
                );
            }
        }
        state.allModes = newAllModes;
    }

    function setCustomMode(place1, place2, mode) {
        console.log(place1);
        if (!["plane", "drive", "walk"].includes(mode)) return;

        const i = state.places.findIndex((p) => p.id === place1.id);
        if (i > -1) {
            if (state.places[i + 1] && state.places[i + 1].id === place2.id) {
                const key1 = `${state.places[i].id} ${state.places[i + 1].id}`;
                const key2 = `${state.places[i + 1].id} ${state.places[i].id}`;
                if (state.customModes[key2]) {
                    delete state.customModes[key2];
                }
                state.customModes[key1] = mode;
                computeAllModes();
            }
        }
        console.log(state.allModes);
        console.log(mode);
        notify();
    }

    function getState() {
        return {
            title: state.title,
            places: state.places.slice(),
            customModes: state.customModes,
            allModes: state.allModes,
        };
    }

    function setTitle(title) {
        state.title = title;
        notify();
    }

    function addPlace(place) {
        if (!place?.id) return;
        if (state.places.some((p) => p.id === place.id)) return;
        state.places.push(place);
        console.log(`Added: `, place);
        if (state.places.length < 2) {
            notify();
            return;
        }

        const key1 = `${state.places[state.places.length - 1].id} ${place.id}`;
        const key2 = `${place.id} ${state.places[state.places.length - 1].id}`;
        if (state.customModes[key1]) {
            state.allModes.push(state.customModes[key1]);
        } else if (state.customModes[key2]) {
            state.allModes.push(state.customModes[key2]);
        } else {
            const defaultMode = defaultModeResolver(
                state.places[state.places.length - 2],
                place
            );
            state.allModes.push(defaultMode);
        }
        notify();
    }

    function removePlace(id) {
        state.places = state.places.filter((p) => p.id !== id);
        const keysToRemove = [];
        Object.keys(state.customModes).forEach((key) => {
            const ids = key.split(" ");
            if (id in ids) {
                keysToRemove.push(key);
            }
        });
        keysToRemove.forEach((key) => {
            delete state.customModes[key];
        });
        computeAllModes();
        notify();
    }

    function movePlace(fromIdx, toIdx) {
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || toIdx < 0) return;
        if (fromIdx >= state.places.length || toIdx > state.places.length)
            return;
        const [moved] = state.places.splice(fromIdx, 1);
        state.places.splice(toIdx, 0, moved);
        computeAllModes();
        notify();
    }

    function subscribe(fn) {
        subs.add(fn);
        fn(getState());
        return () => subs.delete(fn);
    }

    return {
        setCustomMode,
        getState,
        setTitle,
        addPlace,
        removePlace,
        movePlace,
        subscribe,
    };
}
