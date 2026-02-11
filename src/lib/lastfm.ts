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
    const params = new URLSearchParams({
        method: "user.getrecenttracks",
        user: username,
        api_key: apiKey,
        format: "json",
        limit: "1",
    });

    const response = await fetch(`${LASTFM_API_URL}?${params}`);

    if (!response.ok) {
        throw new Error(`Last.fm API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(`Last.fm API Error: ${data.message}`);
    }

    const track = data.recenttracks?.track?.[0];

    return track as LastFmTrack | undefined;
}
