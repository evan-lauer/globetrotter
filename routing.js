const cache = new Map();

function key(profile, a, b) {
    return `${profile}:${a[0]},${a[1]}->${b[0]},${b[1]}`;
}

export async function getDirections(token, profile, from, to) {
    const k = key(profile, from, to);
    if (cache.has(k)) return cache.get(k);

    const base = "https://api.mapbox.com/directions/v5/mapbox";
    const url = `${base}/${profile}/${from[0]},${from[1]};${to[0]},${
        to[1]
    }?geometries=geojson&overview=full&access_token=${encodeURIComponent(
        token
    )}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions HTTP ${res.status}`);
    const json = await res.json();

    const coords = json?.routes?.[0]?.geometry?.coordinates;
    if (!coords || !coords.length) throw new Error("No route found");

    cache.set(k, coords);
    return coords;
}
