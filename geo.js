const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function lonLatToCart([lon, lat]) {
    const φ = toRad(lat);
    const λ = toRad(lon);
    const x = Math.cos(φ) * Math.cos(λ);
    const y = Math.cos(φ) * Math.sin(λ);
    const z = Math.sin(φ);
    return [x, y, z];
}
function cartToLonLat([x, y, z]) {
    const hyp = Math.hypot(x, y);
    const φ = Math.atan2(z, hyp);
    const λ = Math.atan2(y, x);
    return [toDeg(λ), toDeg(φ)];
}
function normalize([x, y, z]) {
    const m = Math.hypot(x, y, z) || 1;
    return [x / m, y / m, z / m];
}

export function greatCircle(a, b, segments = 128) {
    const A = normalize(lonLatToCart(a));
    const B = normalize(lonLatToCart(b));
    const dot = Math.min(
        1,
        Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])
    );
    const ω = Math.acos(dot);
    if (ω === 0) return [a, b];

    const sinω = Math.sin(ω);
    const coords = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const s1 = Math.sin((1 - t) * ω) / sinω;
        const s2 = Math.sin(t * ω) / sinω;
        const x = s1 * A[0] + s2 * B[0];
        const y = s1 * A[1] + s2 * B[1];
        const z = s1 * A[2] + s2 * B[2];
        coords.push(cartToLonLat(normalize([x, y, z])));
    }
    return coords;
}
