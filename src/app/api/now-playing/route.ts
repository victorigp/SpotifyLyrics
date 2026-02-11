import { getLastFmNowPlaying } from "@/lib/lastfm";
import { getSpotifyNowPlaying } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const token = searchParams.get("token"); // Spotify Access Token

    // --- MODE 1: SPOTIFY AUTH ---
    if (token) {
        try {
            const spotifyData = await getSpotifyNowPlaying(token);

            if (!spotifyData || !spotifyData.item) {
                return NextResponse.json({ isPlaying: false });
            }

            const isPlaying = spotifyData.is_playing;
            const item = spotifyData.item;
            const progress_ms = spotifyData.progress_ms; // ABSOLUTE PRECISION

            return NextResponse.json({
                isPlaying,
                source: "spotify",
                progress_ms: progress_ms, // Return exact progress
                timestamp: Date.now(), // Return server time for sync calculation
                track: {
                    id: item.id,
                    name: item.name,
                    artist: item.artists.map((a: any) => a.name).join(", "),
                    album: item.album.name,
                    albumArt: item.album.images[0]?.url,
                    duration: item.duration_ms,
                },
            });

        } catch (e) {
            console.error("Spotify API Error", e);
            return NextResponse.json({ error: "Spotify API Error" }, { status: 500 });
        }
    }

    // --- MODE 2: LAST.FM AUTH ---
    const apiKey = process.env.LASTFM_API_KEY;

    if (!username) {
        return NextResponse.json({ error: "Missing username or token" }, { status: 400 });
    }

    if (!apiKey) {
        return NextResponse.json({ error: "Server configuration error: Missing LASTFM_API_KEY." }, { status: 500 });
    }

    try {
        const track = await getLastFmNowPlaying(username, apiKey);

        if (!track || !track["@attr"]?.nowplaying) {
            return NextResponse.json({ isPlaying: false });
        }

        return NextResponse.json({
            isPlaying: true,
            source: "lastfm",
            track: {
                id: track.name + track.artist["#text"], // Fallback ID
                name: track.name,
                artist: track.artist["#text"],
                album: track.album["#text"],
                albumArt: track.image.find((i: any) => i.size === "extralarge")?.["#text"] || track.image[0]?.["#text"],
                duration: 0,
            },
        });
    } catch (error) {
        console.error("Last.fm API Error:", error);
        // Important: Return 500 so the frontend knows it was an error, NOT a "stop"
        return NextResponse.json({ error: "Last.fm API Error" }, { status: 500 });
    }


}
