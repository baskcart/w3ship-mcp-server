import { slh_dsa_sha2_256s } from '@noble/post-quantum/slh-dsa.js';
import { p256 } from '@noble/curves/nist.js';

export type SignatureScheme = 'SLH-DSA' | 'ECDSA' | 'Unknown';

/**
 * Converts a hex string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
    hex = hex.replace(/^0x/i, '');
    if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
    const array = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return array;
}

/**
 * Identifies the signature scheme based on public key and signature size.
 */
export function identifyScheme(publicKeyHex: string, signatureHex: string): SignatureScheme {
    const pkLen = (publicKeyHex.replace(/^0x/i, '').length) / 2;
    const sigLen = (signatureHex.replace(/^0x/i, '').length) / 2;

    if ((pkLen === 33 || pkLen === 65) && sigLen <= 100) return 'ECDSA';
    if (pkLen === 64 && sigLen > 20000) return 'SLH-DSA';

    return 'Unknown';
}

/**
 * Verifies a signature using the detected scheme.
 */
export function verifySignature(
    publicKeyHex: string,
    signatureHex: string,
    message: string
): { valid: boolean; scheme: SignatureScheme } {
    try {
        const scheme = identifyScheme(publicKeyHex, signatureHex);
        const pubKey = hexToBytes(publicKeyHex);
        const sig = hexToBytes(signatureHex);
        const msg = new TextEncoder().encode(message);

        if (scheme === 'ECDSA') {
            const valid = p256.verify(sig, msg, pubKey);
            return { valid, scheme };
        }

        if (scheme === 'SLH-DSA') {
            const valid = slh_dsa_sha2_256s.verify(sig, msg, pubKey);
            return { valid, scheme };
        }

        return { valid: false, scheme: 'Unknown' };
    } catch (error) {
        console.error('Signature Verification Error:', error);
        return { valid: false, scheme: 'Unknown' };
    }
}
