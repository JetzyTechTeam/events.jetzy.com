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

// Turn rich-text (Quill) HTML into a single plain-text line safe for <meta> tags.
// Social scrapers (notably Apple's iMessage preview) render og:description literally,
// so raw markup like "<p><br></p><p>By Invitation Only</p>" leaks into the preview card.
export const toMetaDescription = (html: string, maxLen = 200): string => {
    if (!html) return "";

    // Block/line boundaries become spaces BEFORE stripping, otherwise
    // "<p>A</p><p>B</p>" collapses to "AB".
    const spaced = html.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, " ");

    const text = stripHtml(spaced)
        // stripHtml only knows a handful of named entities; decode numeric ones too
        // so pasted rich text does not surface "&#233;" in a preview card.
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return "";
    if (text.length <= maxLen) return text;

    const clipped = text.slice(0, maxLen);
    const lastSpace = clipped.lastIndexOf(" ");
    return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
};
