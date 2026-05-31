import { getLyrics, getLyricsLrclibStrict, getLyricsLrclibFuzzy, getLyricsOvh, getLyricsNetease, getLyricsKugou } from "@/lib/lyrics";
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
        } else if (type === "netease") {
            lyrics = await getLyricsNetease(track, artist);
        } else if (type === "kugou") {
            lyrics = await getLyricsKugou(track, artist, duration);
        } else {
            // Default auto behavior
            lyrics = await getLyrics(track, artist, album || "", duration);
        }

        // Return 404 if not found so the UI logs it properly instead of silently failing
        if (!lyrics) {
            return NextResponse.json({ error: `Not found in ${type}` }, { status: 404 });
        }
        return NextResponse.json(lyrics);

    } catch (error: any) {
        console.error("Error in lyrics API:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
