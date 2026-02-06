export interface LyricsData {
    id: number;
    trackName: string;
    artistName: string;
    albumName: string;
    duration: number;
    instrumental: boolean;
    plainLyrics: string;
    syncedLyrics: string;
    source: string;
    error?: string;
}

const LRCLIB_API_URL = "https://lrclib.net/api";

export async function getLyricsLrclibStrict(
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number
): Promise<LyricsData | null> {
    try {
        console.log(`[LRCLIB Strict] Searching: ${trackName} - ${artistName}`);
        let params = new URLSearchParams({
            track_name: trackName,
            artist_name: artistName,
            album_name: albumName,
            duration: durationMs.toString(),
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        // Strict search
        let response = await fetch(`${LRCLIB_API_URL}/get?${params}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return { ...data, source: "LRCLIB" };
        }
    } catch (e) {
        console.error("LRCLIB Strict failed", e);
    }
    return null;
}

export async function getLyricsLrclibFuzzy(
    trackName: string,
    artistName: string
): Promise<LyricsData | null> {
    try {
        const q = `${trackName} ${artistName}`;
        console.log(`[LRCLIB Fuzzy] Searching: ${q}`);
        let params = new URLSearchParams({ q: q });
        let response = await fetch(`${LRCLIB_API_URL}/search?${params}`);
        if (response.ok) {
            const results = await response.json();
            if (Array.isArray(results) && results.length > 0) {
                return { ...results[0], source: "LRCLIB Fuzzy" };
            }
        }
    } catch (e) {
        console.error("LRCLIB Fuzzy failed", e);
    }
    return null;
}

export async function getLyricsOvh(
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number
): Promise<LyricsData | null> {
    try {
        console.log(`[OVH] Searching: ${trackName} - ${artistName}`);
        let response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(trackName)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.lyrics) {
                return {
                    id: 0,
                    trackName: trackName,
                    artistName: artistName,
                    albumName: albumName,
                    duration: durationMs / 1000,
                    instrumental: false,
                    plainLyrics: data.lyrics,
                    syncedLyrics: "",
                    source: "Lyrics.ovh"
                };
            }
        }
    } catch (e) {
        console.error("OVH failed", e);
    }
    return null;
}

export async function getLyrics(
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number
): Promise<LyricsData | null> {
    // Legacy support or default fallback
    let res = await getLyricsLrclibStrict(trackName, artistName, albumName, durationMs);
    if (res) return res;

    res = await getLyricsLrclibFuzzy(trackName, artistName);
    if (res) return res;

    return await getLyricsOvh(trackName, artistName, albumName, durationMs);
}
