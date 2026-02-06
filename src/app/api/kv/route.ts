import { createClient } from "redis";
import { NextRequest, NextResponse } from "next/server";

// Singleton client to prevent multiple connections in serverless environments
let client: any = null;

async function getRedisClient() {
    if (!client) {
        client = createClient({
            url: process.env.REDIS_URL
        });
        client.on("error", (err: any) => console.error("Redis Client Error", err));
        await client.connect();
    }
    return client;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const artist = searchParams.get("artist")?.toLowerCase().trim();
    const track = searchParams.get("track")?.toLowerCase().trim();
    const username = searchParams.get("username")?.toLowerCase().trim();

    if (!artist || !track) {
        return NextResponse.json({ error: "Missing artist or track" }, { status: 400 });
    }

    try {
        const redis = await getRedisClient();
        const lyricsKey = `lyrics:${artist}:${track}`;
        const offsetKey = username ? `offset:${username}:${artist}:${track}` : null;

        // Perform lookups
        const lyricsRaw = await redis.get(lyricsKey);
        const lyrics = lyricsRaw ? JSON.parse(lyricsRaw) : null;

        let offset = 0;
        if (offsetKey) {
            const offsetRaw = await redis.get(offsetKey);
            if (offsetRaw !== null) {
                offset = parseFloat(offsetRaw.toString());
            }
        }

        return NextResponse.json({ lyrics, offset });
    } catch (error) {
        console.error("Redis GET Error:", error);
        return NextResponse.json({ error: "Redis failure" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { artist, track, lyrics, offset, username } = body;

        const cleanArtist = artist?.toLowerCase().trim();
        const cleanTrack = track?.toLowerCase().trim();
        const cleanUsername = username?.toLowerCase().trim();

        if (!cleanArtist || !cleanTrack) {
            return NextResponse.json({ error: "Missing artist or track" }, { status: 400 });
        }

        const redis = await getRedisClient();

        // Save lyrics globally if provided (stringified)
        if (lyrics) {
            const lyricsKey = `lyrics:${cleanArtist}:${cleanTrack}`;
            await redis.set(lyricsKey, JSON.stringify(lyrics));
        }

        // Save offset per user if provided
        if (typeof offset === 'number' && cleanUsername) {
            const offsetKey = `offset:${cleanUsername}:${cleanArtist}:${cleanTrack}`;
            await redis.set(offsetKey, offset.toString());
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Redis POST Error:", error);
        return NextResponse.json({ error: "Redis failure" }, { status: 500 });
    }
}
