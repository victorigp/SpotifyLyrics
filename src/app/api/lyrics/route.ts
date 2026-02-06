import { getLyrics, getLyricsLrclibStrict, getLyricsLrclibFuzzy, getLyricsOvh } from "@/lib/lyrics";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const track = searchParams.get("track");
    const artist = searchParams.get("artist");
    const album = searchParams.get("album");
    const duration = parseInt(searchParams.get("duration") || "0");
    const type = searchParams.get("type"); // strict, fuzzy, ovh, or null (auto)

    if (!track || !artist) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    console.log(`API Access Request: { track: '${track}', artist: '${artist}', type: '${type || 'auto'}' }`);

    let lyrics = null;

    try {
        if (type === "strict") {
            lyrics = await getLyricsLrclibStrict(track, artist, album || "", duration);
        } else if (type === "fuzzy") {
            lyrics = await getLyricsLrclibFuzzy(track, artist);
        } else if (type === "ovh") {
            lyrics = await getLyricsOvh(track, artist, album || "", duration);
        } else {
            // Default auto behavior
            lyrics = await getLyrics(track, artist, album || "", duration);
        }

        // Return null if not found (200 OK with null body is weird, let's just return null JSON)
        return NextResponse.json(lyrics);

    } catch (error) {
        console.error("Error in lyrics API:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
