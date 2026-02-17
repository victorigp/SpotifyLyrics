import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';
import { cleanTrackTitle } from '@/lib/utils';

// Initialize Redis client lazily
const getRedisClient = async () => {
    if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is not defined");
    }
    const client = createClient({
        url: process.env.REDIS_URL
    });

    client.on('error', (err) => console.error('Redis Client Error', err));

    await client.connect();
    return client;
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const artist = searchParams.get('artist');
    const track = searchParams.get('track');
    const userIdRaw = searchParams.get('userId');
    const userId = userIdRaw ? userIdRaw.toLowerCase().trim() : null;

    if (!artist || !track) {
        return NextResponse.json({ error: 'Missing artist or track' }, { status: 400 });
    }

    // Two distinct caches:
    // 1. Search Results (Shared): "video:search:ARTIST:TRACK"
    // 2. User Preference (Individual): "video:pref:USERID:ARTIST:TRACK"

    // Normalize keys
    const safeArtist = artist.toLowerCase().trim();
    const safeTrack = track.toLowerCase().trim();

    const searchCacheKey = `video:search:${safeArtist}:${safeTrack}`;
    const prefCacheKey = userId ? `video:pref:${userId}:${safeArtist}:${safeTrack}` : null;
    const verifiedCacheKey = `video:verified:${safeArtist}:${safeTrack}`;
    const failedCacheKey = `video:failed:${safeArtist}:${safeTrack}`;

    console.log(`[VIDEO API GET] Key: ${prefCacheKey}`);
    console.log(`[VIDEO API] Artist: ${safeArtist} | Track: ${safeTrack} | UserId: ${userId}`);

    let client;
    try {
        client = await getRedisClient();

        // 1. Get User Preference
        let preferredVideoId: string | null = null;
        if (prefCacheKey) {
            preferredVideoId = await client.get(prefCacheKey);
            console.log(`[VIDEO API GET] Valor Pref recuperado: ${preferredVideoId}`);
        }

        // 2. Get Verified Videos & Failed Videos
        const verifiedVideos = await client.sMembers(verifiedCacheKey);
        const failedVideos = await client.sMembers(failedCacheKey);
        const failedSet = new Set(failedVideos);

        console.log(`[VIDEO API GET] Verificados: ${verifiedVideos.length}, Fallidos: ${failedVideos.length}`);

        // 2. Try to get cached search results (Shared)
        let videoIds: string[] = [];
        const cachedSearch = await client.get(searchCacheKey);

        let searchFound = false;

        if (cachedSearch) {
            if (cachedSearch === 'not_found') {
                // Explicitly stored "not found" state
                await client.disconnect();
                return NextResponse.json({ videoIds: [], debugPref: preferredVideoId });
            }

            try {
                // Redis v4 returns string, need to parse JSON if we stored JSON
                // Check if it's a JSON array string
                if (cachedSearch.startsWith('[')) {
                    videoIds = JSON.parse(cachedSearch);
                } else {
                    // Legacy or single ID
                    videoIds = [cachedSearch];
                }
                searchFound = true;
            } catch (e) {
                console.error("Cache parse warning", e);
            }
        }

        // 3. If no search results in cache, fetch from YouTube
        if (!searchFound || videoIds.length === 0) {
            const apiKey = process.env.YOUTUBE_API_KEY;

            // Helper for youtube fetch
            const fetchYoutube = async (q: string) => {
                if (!apiKey) return null;
                const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=25&key=${apiKey}`;
                const res = await fetch(youtubeUrl);
                if (!res.ok) return null;
                return await res.json();
            };

            if (!apiKey) {
                if (client.isOpen) await client.disconnect();
                return NextResponse.json({ error: 'YouTube API key missing' }, { status: 500 });
            }

            // A. Try CLEANED title first
            const cleanTrack = cleanTrackTitle(track);
            let query = `${artist} ${cleanTrack}`;
            let data = await fetchYoutube(query);

            if (cleanTrack !== track) {
                if (!data?.items || data.items.length === 0) {
                    // B. If clean failed (and was different), try ORIGINAL title
                    console.log(`[YouTube] Clean title failed. Reverting to original: ${track}`);
                    const origQuery = `${artist} ${track}`;
                    const origData = await fetchYoutube(origQuery);
                    if (origData?.items?.length > 0) {
                        data = origData;
                    }
                }
            }

            if (!data || !data.items) {
                console.error("YouTube API Error or No Results", data);
                if (client.isOpen) await client.disconnect();
                // Return empty instead of error 502 if purely not found?
                // But legacy behavior was 502 for error. Let's keep it but maybe 404 is better for "not found".
                // If data is null (API error), 502. If data is {} or {items:[]}, it's just not found.
                // data from fetchYoutube returns null on !res.ok.
                if (data === null) {
                    return NextResponse.json({ error: 'YouTube API Error' }, { status: 502 });
                }
                // If it's valid JSON but no items, it means effectively not found, so empty videoIds.
                videoIds = [];
            } else {
                videoIds = data.items.map((item: any) => item.id.videoId);
            }

            // ... cache logic follows ...

            // Cache the results (Shared)
            if (videoIds.length === 0) {
                await client.set(searchCacheKey, 'not_found', { EX: 60 * 60 * 24 }); // 24h
            } else {
                await client.set(searchCacheKey, JSON.stringify(videoIds), { EX: 60 * 60 * 24 * 30 }); // 30 days
            }
        }

        // 5. Smart Merge Logic
        // Priority: [UserPref] > [VerifiedVideos] > [Rest of Search Results]
        // Filter: Remove [FailedVideos] from everywhere

        const finalQueue = new Set<string>();

        // Helper to add if valid
        const addIfValid = (id: string) => {
            if (!failedSet.has(id)) finalQueue.add(id);
        };


        // 1. Add VERIFIED videos first (High quality pool)
        if (verifiedVideos && Array.isArray(verifiedVideos)) {
            verifiedVideos.forEach((v: string) => addIfValid(v));
        }

        // 2. Add SEARCH results (Natural order from YouTube)
        videoIds.forEach(v => addIfValid(v));

        // 3. Ensure PREFERRED video is in the list (if valid and not added yet)
        if (preferredVideoId) addIfValid(preferredVideoId);

        // Check if all found videos are already known (verified or failed)
        let isDiscoveryComplete = false;
        if (videoIds.length > 0) {
            const knownIds = new Set([...(verifiedVideos || []), ...Array.from(failedSet)]);
            isDiscoveryComplete = videoIds.every((id: string) => knownIds.has(id));
        }

        if (client.isOpen) await client.disconnect();

        // Return queue + preferred ID + discovery status
        return NextResponse.json({
            videoIds: Array.from(finalQueue),
            preferredVideoId: preferredVideoId,
            isDiscoveryComplete
        });

    } catch (error) {
        console.error('Video API Error:', error);
        if (client && client.isOpen) await client.disconnect();
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    let client;
    try {
        const body = await req.json();
        const { artist, track, videoId, userId, status } = body;

        if (!artist || !track || !videoId || !userId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }


        client = await getRedisClient();
        const safeArtist = artist.toLowerCase().trim();
        const safeTrack = track.toLowerCase().trim();
        const safeUserId = userId.toLowerCase().trim();

        // Safe Artist + Track Key
        const prefCacheKey = `video:pref:${safeUserId}:${safeArtist}:${safeTrack}`;
        const verifiedCacheKey = `video:verified:${safeArtist}:${safeTrack}`;
        const failedCacheKey = `video:failed:${safeArtist}:${safeTrack}`;

        if (status === 'failed') {
            await client.sAdd(failedCacheKey, videoId);
        } else {
            // 1. Save User Preference
            await client.set(prefCacheKey, videoId);

            // Add to verified
            await client.sAdd(verifiedCacheKey, videoId);

            // Remove from failed list if it exists there (Forgive the video)
            await client.sRem(failedCacheKey, videoId);
        }

        await client.disconnect();
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("POST Error", e);
        if (client && client.isOpen) await client.disconnect();
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
