import { getLastFmNowPlaying } from "@/lib/lastfm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const apiKey = process.env.LASTFM_API_KEY;

    if (!username) {
        return NextResponse.json({ error: "Missing username" }, { status: 400 });
    }

    if (!apiKey) {
        return NextResponse.json({ error: "Server configuration error: Missing LASTFM_API_KEY." }, { status: 500 });
    }

    const track = await getLastFmNowPlaying(username, apiKey);

    if (!track || !track["@attr"]?.nowplaying) {
        return NextResponse.json({ isPlaying: false });
    }

    return NextResponse.json({
        isPlaying: true,
        track: {
            id: track.name + track.artist["#text"],
            name: track.name,
            artist: track.artist["#text"],
            album: track.album["#text"],
            albumArt: track.image.find((i: any) => i.size === "extralarge")?.["#text"] || track.image[0]?.["#text"],
            duration: 0,
            progress: 0,
        },
    });
}
