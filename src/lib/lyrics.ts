import { cleanTrackTitle } from "@/lib/utils";

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
    const doSearch = async (tName: string) => {
        try {
            console.log(`[LRCLIB Strict] Searching: ${tName} - ${artistName}`);
            let params = new URLSearchParams({
                track_name: tName,
                artist_name: artistName,
                album_name: albumName,
            });
            if (durationMs > 0) {
                params.append("duration", durationMs.toString());
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

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
    };

    const cleaned = cleanTrackTitle(trackName);
    let res = await doSearch(cleaned);
    if (res) return res;

    if (cleaned !== trackName) {
        console.log(`[LRCLIB Strict] Retry with original title: "${trackName}"`);
        return await doSearch(trackName);
    }

    return null;
}

export async function getLyricsLrclibFuzzy(
    trackName: string,
    artistName: string
): Promise<LyricsData | null> {
    const doSearch = async (tName: string) => {
        try {
            const q = `${tName} ${artistName}`;
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
    };

    const cleaned = cleanTrackTitle(trackName);
    let res = await doSearch(cleaned);
    if (res) return res;

    if (cleaned !== trackName) {
        return await doSearch(trackName);
    }
    return null;
}

export async function getLyricsOvh(
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number
): Promise<LyricsData | null> {
    const doSearch = async (tName: string) => {
        try {
            console.log(`[OVH] Searching: ${tName} - ${artistName}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            let response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(tName)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                if (data.lyrics) {
                    return {
                        id: 0,
                        trackName: tName,
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
    };

    const cleaned = cleanTrackTitle(trackName);
    let res = await doSearch(cleaned);
    if (res) return res;

    if (cleaned !== trackName) {
        return await doSearch(trackName);
    }
    return null;
}

export async function getLyricsNetease(
    trackName: string,
    artistName: string
): Promise<LyricsData | null> {
    let netease_search: any;
    let netease_lyric: any;
    try {
        const Netease = require('NeteaseCloudMusicApi');
        netease_search = Netease.cloudsearch || Netease.search;
        netease_lyric = Netease.lyric;
    } catch (e: any) {
        console.error("Failed to load Netease API dynamically", e);
        throw new Error(`Netease Init Error: ${e.message}`);
    }

    if (!netease_search || !netease_lyric) {
        throw new Error("Netease modules are undefined after import");
    }

    const doSearch = async (tName: string) => {
        try {
            const q = `${tName} ${artistName}`;
            console.log(`[Netease] Searching: ${q}`);

            // 1. Search
            const searchRes = await netease_search({
                keywords: q,
                type: 1, // 1: Song
                limit: 5
            });

            // Netease result structure check
            const sBody: any = searchRes.body;
            if (searchRes.status === 200 && sBody?.result?.songs) {
                const songs = sBody.result.songs;
                if (songs.length > 0) {
                    const bestMatch = songs[0];
                    const songId = bestMatch.id;

                    console.log(`[Netease] Match found: "${bestMatch.name}" by ${bestMatch.ar?.[0]?.name} (ID: ${songId})`);

                    // 2. Get Lyrics
                    const lyricRes = await netease_lyric({ id: songId });
                    const lBody: any = lyricRes.body;

                    if (lyricRes.status === 200 && (lBody?.lrc?.lyric || lBody?.tlyric?.lyric)) {
                        const rawLrc = lBody.lrc?.lyric || "";

                        // Simple instrumental check
                        const isInstrumental = lBody.nolyric || rawLrc.includes("纯音乐") || rawLrc.includes("Pure Music");

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
        } catch (e: any) {
            console.error("Netease failed", e);
            throw new Error(`Netease Search Error: ${e.message}`);
        }
        return null;
    };

    const cleaned = cleanTrackTitle(trackName);
    let res = await doSearch(cleaned);
    if (res) return res;

    if (cleaned !== trackName) {
        return await doSearch(trackName);
    }
    return null;
}

export async function getLyricsKugou(
    trackName: string,
    artistName: string,
    durationMs: number
): Promise<LyricsData | null> {
    try {
        console.log(`[KuGou] Searching: ${trackName} - ${artistName}`);
        const durationSec = Math.floor(durationMs / 1000);
        
        // 1. Search for songs to get hash
        const q = encodeURIComponent(`${trackName} ${artistName}`);
        const songSearchUrl = `https://mobileservice.kugou.com/api/v3/search/song?version=9108&plat=0&pagesize=8&showtype=0&keyword=${q}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const songRes = await fetch(songSearchUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        let candidate: { id: string, accesskey: string } | null = null;

        if (songRes.ok) {
            const songData = await songRes.json();
            if (songData?.data?.info?.length > 0) {
                // Find matching duration and hash
                for (const song of songData.data.info) {
                    if (durationSec === 0 || Math.abs(song.duration - durationSec) <= 8) {
                        const hashRes = await fetch(`https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=${song.hash}`, {
                            headers: { "User-Agent": "Mozilla/5.0" }
                        });
                        if (hashRes.ok) {
                            const hashData = await hashRes.json();
                            if (hashData?.candidates?.length > 0) {
                                candidate = hashData.candidates[0];
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 2. Fallback to keyword search if no hash candidate
        if (!candidate) {
            const kw = encodeURIComponent(`${trackName} - ${artistName}`);
            let kwUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${kw}`;
            if (durationSec > 0) kwUrl += `&duration=${durationSec * 1000}`;
            
            const kwRes = await fetch(kwUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (kwRes.ok) {
                const kwData = await kwRes.json();
                if (kwData?.candidates?.length > 0) {
                    candidate = kwData.candidates[0];
                }
            }
        }

        // 3. Download lyrics
        if (candidate) {
            const dlUrl = `https://lyrics.kugou.com/download?fmt=lrc&charset=utf8&client=pc&ver=1&id=${candidate.id}&accesskey=${candidate.accesskey}`;
            const dlRes = await fetch(dlUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (dlRes.ok) {
                const dlData = await dlRes.json();
                if (dlData?.content) {
                    const decoded = Buffer.from(dlData.content, 'base64').toString('utf8');
                    
                    // Normalize lyrics (remove empty lines or weird Kugou tags)
                    const lines = decoded.split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 0 && !l.match(/.+].+[:：].+/));
                    
                    const finalLrc = lines.join('\n');
                    
                    return {
                        id: parseInt(candidate.id) || 0,
                        trackName,
                        artistName,
                        albumName: "",
                        duration: durationSec,
                        instrumental: false,
                        plainLyrics: finalLrc,
                        syncedLyrics: finalLrc,
                        source: "KuGou"
                    };
                }
            }
        }
    } catch (e) {
        console.error("KuGou failed", e);
    }
    return null;
}

export async function getLyrics(
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number
): Promise<LyricsData | null> {
    // 1. KuGou (Chinese provider, highly synced, huge library)
    let res = await getLyricsKugou(trackName, artistName, durationMs);
    if (res) return res;

    // 2. LRCLIB Strict
    res = await getLyricsLrclibStrict(trackName, artistName, albumName, durationMs);
    if (res) return res;

    res = await getLyricsLrclibFuzzy(trackName, artistName);
    if (res) return res;

    // Netease (Chinese provider, good backup)
    res = await getLyricsNetease(trackName, artistName);
    if (res) return res;

    return await getLyricsOvh(trackName, artistName, albumName, durationMs);
}
