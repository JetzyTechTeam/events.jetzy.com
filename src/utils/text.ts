// Escape user input before using it inside a MongoDB $regex / new RegExp.
// Without this, characters like \ ] ( | * form an invalid pattern and throw
// (500), and crafted input can cause catastrophic backtracking (ReDoS).
export const escapeRegExp = (s: string) => (s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const stripHtml = (html: string) => {
    if (!html) return "";

    // Create a temporary DOM element to handle entity decoding if we were in browser environment
    // But since this might run on server side (Next.js), we need a regex/replace approach for consistency or use a library.
    // Given the constraints and typical Next.js setups, a regex replacement for tags and common entities is safest for a quick fix without new deps.

    // 1. Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');

    // 2. Decode common HTML entities (expand as needed)
    const entities: { [key: string]: string } = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'"
    };

    text = text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => entities[entity] || entity);

    return text.trim();
};
