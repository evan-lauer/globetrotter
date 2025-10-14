export function emit(eventName, origin = document) {
    console.log("emitting: ", eventName);
    const event = new CustomEvent(eventName);
    origin.dispatchEvent(event);
}
