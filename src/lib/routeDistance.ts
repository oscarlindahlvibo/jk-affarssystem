export interface RouteDistanceResult {
  distanceKm: number;
  source: "osrm" | "local";
  stops: Array<{ query: string; lat: number; lon: number; displayName: string }>;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  address: string;
  place: string;
  lat: number;
  lon: number;
}

interface Coordinates {
  lat: number;
  lon: number;
  displayName: string;
}

const SWEDISH_PLACES: Record<string, Coordinates> = {
  alingsas: { lat: 57.9303, lon: 12.5335, displayName: "Alingsås" },
  boras: { lat: 57.721, lon: 12.9401, displayName: "Borås" },
  eskilstuna: { lat: 59.3712, lon: 16.5098, displayName: "Eskilstuna" },
  falun: { lat: 60.6065, lon: 15.6355, displayName: "Falun" },
  gavle: { lat: 60.6749, lon: 17.1413, displayName: "Gävle" },
  goteborg: { lat: 57.7089, lon: 11.9746, displayName: "Göteborg" },
  halmstad: { lat: 56.6745, lon: 12.8568, displayName: "Halmstad" },
  helsingborg: { lat: 56.0465, lon: 12.6945, displayName: "Helsingborg" },
  jonkoping: { lat: 57.7826, lon: 14.1618, displayName: "Jönköping" },
  kalmar: { lat: 56.6634, lon: 16.3568, displayName: "Kalmar" },
  karlskrona: { lat: 56.1612, lon: 15.5869, displayName: "Karlskrona" },
  karlstad: { lat: 59.3793, lon: 13.5036, displayName: "Karlstad" },
  kristianstad: { lat: 56.0294, lon: 14.1567, displayName: "Kristianstad" },
  linkoping: { lat: 58.4108, lon: 15.6214, displayName: "Linköping" },
  lulea: { lat: 65.5848, lon: 22.1547, displayName: "Luleå" },
  lund: { lat: 55.7047, lon: 13.191, displayName: "Lund" },
  malmo: { lat: 55.605, lon: 13.0038, displayName: "Malmö" },
  norrkoping: { lat: 58.5877, lon: 16.1924, displayName: "Norrköping" },
  nykoping: { lat: 58.753, lon: 17.0079, displayName: "Nyköping" },
  orebro: { lat: 59.2753, lon: 15.2134, displayName: "Örebro" },
  oskarshamn: { lat: 57.2646, lon: 16.4484, displayName: "Oskarshamn" },
  stockholm: { lat: 59.3293, lon: 18.0686, displayName: "Stockholm" },
  sundsvall: { lat: 62.3908, lon: 17.3069, displayName: "Sundsvall" },
  tingsryd: { lat: 56.5247, lon: 14.979, displayName: "Tingsryd" },
  umea: { lat: 63.8258, lon: 20.263, displayName: "Umeå" },
  upplandsvasby: { lat: 59.5184, lon: 17.9113, displayName: "Upplands Väsby" },
  uppsala: { lat: 59.8586, lon: 17.6389, displayName: "Uppsala" },
  varberg: { lat: 57.1056, lon: 12.2508, displayName: "Varberg" },
  vasteras: { lat: 59.6099, lon: 16.5448, displayName: "Västerås" },
  vaxjo: { lat: 56.8777, lon: 14.8091, displayName: "Växjö" },
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findLocalPlace(query: string): Coordinates | null {
  const normalized = normalize(query);
  const direct = SWEDISH_PLACES[normalized.replace(/\s/g, "")];
  if (direct) return direct;
  const match = Object.entries(SWEDISH_PLACES).find(([key, place]) => {
    const display = normalize(place.displayName);
    return normalized.includes(key) || normalized.includes(display);
  });
  return match?.[1] ?? null;
}

function localPlaceSuggestions(query: string): AddressSuggestion[] {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  return Object.entries(SWEDISH_PLACES)
    .filter(([key, place]) => key.includes(normalized.replace(/\s/g, "")) || normalize(place.displayName).includes(normalized))
    .slice(0, 5)
    .map(([key, place]) => ({
      id: `local-${key}`,
      label: place.displayName,
      address: place.displayName,
      place: place.displayName,
      lat: place.lat,
      lon: place.lon,
    }));
}

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return localPlaceSuggestions(trimmed);

  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", "7");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return localPlaceSuggestions(trimmed);
    const data = (await response.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: {
          osm_id?: number;
          name?: string;
          housenumber?: string;
          street?: string;
          city?: string;
          county?: string;
          postcode?: string;
          country?: string;
          countrycode?: string;
        };
      }>;
    };
    const suggestions =
      data.features
        ?.filter((feature) => ["SE", "DK", "NO", "FI"].includes(feature.properties.countrycode ?? ""))
        .map((feature, index) => {
          const [lon, lat] = feature.geometry.coordinates;
          const streetLine = [feature.properties.street, feature.properties.housenumber].filter(Boolean).join(" ");
          const address = [streetLine || feature.properties.name, feature.properties.postcode, feature.properties.city || feature.properties.county]
            .filter(Boolean)
            .join(", ");
          const label = [address, feature.properties.country].filter(Boolean).join(", ");
          return {
            id: `${feature.properties.osm_id ?? index}-${lon}-${lat}`,
            label,
            address: address || feature.properties.name || trimmed,
            place: feature.properties.city || feature.properties.name || feature.properties.county || "",
            lat,
            lon,
          };
        })
        .filter((suggestion) => suggestion.label) ?? [];
    return suggestions.length > 0 ? suggestions : localPlaceSuggestions(trimmed);
  } catch {
    return localPlaceSuggestions(trimmed);
  }
}

async function geocode(query: string): Promise<Coordinates | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", "5");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (response.ok) {
      const data = (await response.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: {
            name?: string;
            street?: string;
            city?: string;
            postcode?: string;
            country?: string;
            countrycode?: string;
          };
        }>;
      };
      const first =
        data.features?.find((feature) => ["SE", "DK", "NO", "FI"].includes(feature.properties.countrycode ?? "")) ??
        data.features?.[0];
      if (first) {
        const [lon, lat] = first.geometry.coordinates;
        const displayName = [
          first.properties.name,
          first.properties.street,
          first.properties.postcode,
          first.properties.city,
          first.properties.country,
        ]
          .filter(Boolean)
          .join(", ");
        return { lat, lon, displayName };
      }
    }
  } catch {
    // Fall back to local place lookup below.
  }
  return findLocalPlace(trimmed);
}

function haversineKm(a: Coordinates, b: Coordinates) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function routeWithOsrm(stops: Coordinates[]) {
  const coordinates = stops.map((stop) => `${stop.lon},${stop.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Kunde inte hämta körsträcka.");
  const data = (await response.json()) as { routes?: Array<{ distance: number }> };
  const distanceMeters = data.routes?.[0]?.distance;
  if (!distanceMeters) throw new Error("Kunde inte läsa körsträckan.");
  return distanceMeters / 1000;
}

export async function calculateRouteDistance(queries: string[]): Promise<RouteDistanceResult> {
  const cleanQueries = queries.map((query) => query.trim()).filter(Boolean);
  if (cleanQueries.length < 2) throw new Error("Fyll i minst lastning och lossning.");

  const geocoded = await Promise.all(cleanQueries.map(geocode));
  const missingIndex = geocoded.findIndex((stop) => !stop);
  if (missingIndex >= 0) throw new Error(`Kunde inte hitta platsen "${cleanQueries[missingIndex]}".`);

  const stops = geocoded as Coordinates[];
  try {
    const distanceKm = await routeWithOsrm(stops);
    return {
      distanceKm: Math.round(distanceKm),
      source: "osrm",
      stops: stops.map((stop, index) => ({ query: cleanQueries[index], ...stop })),
    };
  } catch {
    const estimatedKm = stops.slice(1).reduce((sum, stop, index) => sum + haversineKm(stops[index], stop) * 1.25, 0);
    return {
      distanceKm: Math.round(estimatedKm),
      source: "local",
      stops: stops.map((stop, index) => ({ query: cleanQueries[index], ...stop })),
    };
  }
}
