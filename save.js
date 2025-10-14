const LOCAL_STORAGE_KEY = "wanderlog-state";
const DEFAULT_TITLE = "Trip to Nice";
const DEFAULT_PLACES = [
    {
        id: "-73.8718178,40.7731251",
        name: "LaGuardia Airport",
        coords: [-73.8718178, 40.7731251],
        regionString: "New York City, United States",
    },
    {
        id: "7.205782413482666,43.65974044799805",
        name: "Nice-Côte d'Azur Airport",
        coords: [7.205782413482666, 43.65974044799805],
        regionString: "Nice, France",
    },
    {
        id: "7.25841,43.694523",
        name: "Le Negresco",
        coords: [7.25841, 43.694523],
        regionString: "Nice, France",
    },
    {
        id: "7.277436,43.694954",
        name: "Plage Publique de Castel",
        coords: [7.277436, 43.694954],
        regionString: "Nice, France",
    },
    {
        id: "7.27650088,43.69937752",
        name: "Lycée Masséna",
        coords: [7.27650088, 43.69937752],
        regionString: "Nice, France",
    },
    {
        id: "7.334797,43.70583",
        name: "La Table de la Réserve",
        coords: [7.334797, 43.70583],
        regionString: "Beaulieu-sur-Mer, France",
    },
    {
        id: "7.33375,43.70415",
        name: "Villa Kérylos",
        coords: [7.33375, 43.70415],
        regionString: "Beaulieu-sur-Mer, France",
    },
    {
        id: "7.329647,43.700764",
        name: "Delcloy Hotel",
        coords: [7.329647, 43.700764],
        regionString: "Saint-Jean-Cap-Ferrat, France",
    },
    {
        id: "7.42375676,43.73081557",
        name: "Monaco Town Hall",
        coords: [7.42375676, 43.73081557],
        regionString: "Monaco, Monaco",
    },
    {
        id: "7.4192935,43.72572341",
        name: "Héliport de Monaco",
        coords: [7.4192935, 43.72572341],
        regionString: "Monaco, Monaco",
    },
    {
        id: "-3.5697845,40.4644332",
        name: "Madrid-Barajas International Airport",
        coords: [-3.5697845, 40.4644332],
        regionString: "Madrid, Spain",
    },
    {
        id: "-73.7818999,40.6437681",
        name: "John F. Kennedy International Airport",
        coords: [-73.7818999, 40.6437681],
        regionString: "New York City, United States",
    },
];
const DEFAULT_CUSTOM_MODES = {
    "7.4192935,43.72572341 -3.5697845,40.4644332": "plane",
    "7.42375676,43.73081557 7.4192935,43.72572341": "drive",
    "7.329647,43.700764 7.42375676,43.73081557": "drive",
    "7.33375,43.70415 7.329647,43.700764": "drive",
    "7.27650088,43.69937752 7.334797,43.70583": "drive",
    "7.205782413482666,43.65974044799805 7.25841,43.694523": "drive",
};

export function loadOrDefault(
    defaultValue = {
        title: DEFAULT_TITLE,
        places: DEFAULT_PLACES,
        customModes: DEFAULT_CUSTOM_MODES,
    }
) {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
        const data = JSON.parse(raw);
        if (validateData(data)) {
            return data;
        }
    }
    return defaultValue;
}

export function save(data) {
    if (validateData(data)) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } else {
        throw new TypeError("<data> is the wrong shape");
    }
}

export function clear() {
    localStorage.clear();
}

function validateData(data) {
    return (
        Object.hasOwn(data, "title") &&
        Object.hasOwn(data, "places") &&
        Object.hasOwn(data, "customModes")
    );
}
