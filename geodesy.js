const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversine(a, b) {
    const [lon1, lat1] = a;
    const [lon2, lat2] = b;
    const φ1 = toRad(lat1),
        φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const s =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function bearing(a, b) {
    const [λ1, φ1] = [toRad(a[0]), toRad(a[1])];
    const [λ2, φ2] = [toRad(b[0]), toRad(b[1])];
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
}
export function cumulativeMeters(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
        cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
    }
    return cum;
}
export function pointAtDistance(coords, cum, d) {
    if (d <= 0) return coords[0];
    const total = cum[cum.length - 1];
    if (d >= total) return coords[coords.length - 1];
    let i = 1;
    while (i < cum.length && cum[i] < d) i++;
    const d0 = cum[i - 1],
        d1 = cum[i];
    const t = (d - d0) / (d1 - d0 || 1);
    const a = coords[i - 1],
        b = coords[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export function lerpAngle(a, b, t) {
    let diff = ((b - a + 540) % 360) - 180;
    return (a + diff * t + 360) % 360;
}
