
export function cleanTrackTitle(title: string): string {
    return title
        .replace(/\s-\s.*remaster.*/i, "")
        .replace(/\(remaster.*\)/i, "")
        .replace(/\s-\s.*live.*/i, "")
        .replace(/\(live.*\)/i, "")
        .replace(/\s-\s.*version.*/i, "")
        .replace(/\(.*?version\)/i, "")
        .replace(/\s-\s\d{4}.*/i, "")
        .replace(/\s-\s.*mix/i, "")
        .replace(/\[.*?\]/g, "")
        .trim();
}
