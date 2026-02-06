const LASTFM_API_URL = "http://ws.audioscrobbler.com/2.0/";

export interface LastFmTrack {
    name: string;
    artist: { "#text": string };
    album: { "#text": string };
    image: { "#text": string; size: string }[];
    "@attr"?: {
        nowplaying: string;
    };
}

export async function getLastFmNowPlaying(username: string, apiKey: string) {
    try {
        const params = new URLSearchParams({
            method: "user.getrecenttracks",
            user: username,
            api_key: apiKey,
            format: "json",
            limit: "1",
        });

        const response = await fetch(`${LASTFM_API_URL}?${params}`);

        if (!response.ok) {
            console.error("Last.fm API Error:", response.statusText);
            return null;
        }

        const data = await response.json();
        const track = data.recenttracks?.track?.[0];

        return track as LastFmTrack | undefined;
    } catch (error) {
        console.error("Error fetching Last.fm data:", error);
        return null;
    }
}
