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

// Netease API Import (Dynamic require to avoid build issues if types missing)
let netease_search: any;
let netease_lyric: any;
try {
    const Netease = require('NeteaseCloudMusicApi');
    netease_search = Netease.cloudsearch; // cloudsearch is often better than search
    if (!netease_search) netease_search = Netease.search;
    netease_lyric = Netease.lyric;
} catch (e) { console.error("Failed to load Netease API", e); }

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
        const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let response = await fetch(`${LRCLIB_API_URL}/search?${params}`, { signal: controller.signal });
        clearTimeout(timeoutId);
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(trackName)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
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

export async function getLyricsNetease(
    trackName: string,
    artistName: string
): Promise<LyricsData | null> {
    if (!netease_search || !netease_lyric) return null;

    try {
        const q = `${trackName} ${artistName}`;
        console.log(`[Netease] Searching: ${q}`);

        // 1. Search
        const searchRes = await netease_search({
            keywords: q,
            type: 1, // 1: Song
            limit: 5
        });

        // Netease result structure check
        if (searchRes.status === 200 && searchRes.body?.result?.songs) {
            const songs = searchRes.body.result.songs;
            if (songs.length > 0) {
                const bestMatch = songs[0];
                const songId = bestMatch.id;

                console.log(`[Netease] Match found: "${bestMatch.name}" by ${bestMatch.ar?.[0]?.name} (ID: ${songId})`);

                // 2. Get Lyrics
                const lyricRes = await netease_lyric({ id: songId });

                if (lyricRes.status === 200 && (lyricRes.body?.lrc?.lyric || lyricRes.body?.tlyric?.lyric)) {
                    const rawLrc = lyricRes.body.lrc?.lyric || "";
                    const rawTlyric = lyricRes.body.tlyric?.lyric || ""; // Translation, maybe not needed?

                    // Simple instrumental check
                    const isInstrumental = lyricRes.body.nolyric || rawLrc.includes("纯音乐") || rawLrc.includes("Pure Music");

                    return {
                        id: songId,
                        trackName: bestMatch.name,
                        artistName: bestMatch.ar?.[0]?.name || artistName,
                        albumName: bestMatch.al?.name || "",
                        duration: bestMatch.dt / 1000,
                        instrumental: !!isInstrumental,
                        plainLyrics: rawLrc,
                        syncedLyrics: rawLrc, // Netease is usually synced
                        source: "Netease"
                    };
                }
            }
        }
    } catch (e) {
        console.error("Netease failed", e);
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

    // Netease (Chinese provider, good backup)
    res = await getLyricsNetease(trackName, artistName);
    if (res) return res;

    return await getLyricsOvh(trackName, artistName, albumName, durationMs);
}
