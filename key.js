// On prod, expect key_content.txt to exist.
// On dev, expect dev_key_content.txt to exist
export default function getAPIKey() {
    if (
        window.location.href.includes("evandavidlauer.com") ||
        window.location.href.includes(".vercel.app")
    ) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "key_content.txt", false);
            xhr.send(null);
            if (xhr.status === 200) {
                return xhr.responseText.trim();
            }
        } catch (e) {
            console.error("Expected key_content.txt, or other error");
        }
        return undefined;
    } else {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "dev_key_content.txt", false);
            xhr.send(null);
            if (xhr.status === 200) {
                return xhr.responseText.trim();
            }
        } catch (e) {
            console.error("Expected dev_key_content.txt, or other error");
        }
        return undefined;
    }
}
