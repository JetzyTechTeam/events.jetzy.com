import crypto from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET || 'jetzy-magic-secret';

interface MagicLinkData {
    email?: string;
    firstName?: string;
    lastName?: string;
    _id?: string;
    accessToken?: string;
}

/**
 * Generates a magic token for auto-login.
 * Format: base64(data).base64(signature)
 */
export function generateMagicToken(data: MagicLinkData): string {
    const dataStr = JSON.stringify(data);
    const base64Data = Buffer.from(dataStr).toString('base64');

    const signature = crypto
        .createHmac('sha256', SECRET)
        .update(base64Data)
        .digest('hex');

    return `${base64Data}.${signature}`;
}

/**
 * Verifies and parses a magic token.
 * Supports both 2-part signature tokens and 3-part JWT tokens.
 */
export function verifyMagicToken(token: string): MagicLinkData | null {
    try {
        const parts = token.split('.');
        
        // Handle 3-part JWT tokens (standard JWT format)
        if (parts.length === 3) {
            console.log('[MagicLink] Detected 3-part JWT token');
            const payload = parts[1];
            const dataStr = Buffer.from(payload, 'base64').toString('utf8');
            return JSON.parse(dataStr) as MagicLinkData;
        }

        // Handle 2-part signature tokens (custom legacy format)
        if (parts.length === 2) {
            const [base64Data, signature] = parts;
            if (!base64Data || !signature) return null;

            const expectedSignature = crypto
                .createHmac('sha256', SECRET)
                .update(base64Data)
                .digest('hex');

            if (signature !== expectedSignature) {
                console.error('[MagicLink] Invalid signature');
                return null;
            }

            const dataStr = Buffer.from(base64Data, 'base64').toString('utf8');
            return JSON.parse(dataStr) as MagicLinkData;
        }

        return null;
    } catch (error) {
        console.error('[MagicLink] Verification failed:', error);
        return null;
    }
}

