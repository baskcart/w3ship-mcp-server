/**
 * Validates if the given string is a valid SLH-DSA public key (hex encoded).
 * SLH-DSA-SHA2-128f/s public keys are typically 32 bytes (64 hex characters).
 */
export function isValidSlhDsaPublicKey(publicKeyHex: string): boolean {
    try {
        const cleaned = publicKeyHex.replace(/^0x/i, '');
        // 32 bytes = 64 hex characters
        return cleaned.length === 64 && /^[0-9a-fA-F]+$/.test(cleaned);
    } catch (e) {
        return false;
    }
}

/**
 * Validates if the given string is a valid ECDSA public key (hex encoded).
 * P-256 keys are 33 bytes (compressed) or 65 bytes (uncompressed).
 */
export function isValidEcdsaPublicKey(publicKeyHex: string): boolean {
    try {
        const cleaned = publicKeyHex.replace(/^0x/i, '');
        // 33 bytes = 66 chars (compressed)
        // 65 bytes = 130 chars (uncompressed)
        return (cleaned.length === 66 || cleaned.length === 130) && /^[0-9a-fA-F]+$/.test(cleaned);
    } catch (e) {
        return false;
    }
}

/**
 * Validates if the given string is a valid Ethereum address (hex encoded).
 * Ethereum addresses are 20 bytes (40 hex characters), optionally prefixed with 0x.
 */
export function isValidEvmAddress(addressHex: string): boolean {
    try {
        const cleaned = addressHex.replace(/^0x/i, '');
        return cleaned.length === 40 && /^[0-9a-fA-F]+$/.test(cleaned);
    } catch (e) {
        return false;
    }
}

/**
 * Returns the key type based on length, or null if invalid.
 */
export function getKeyType(publicKeyHex: string): 'SLH-DSA' | 'ECDSA' | 'EVM-Address' | null {
    if (isValidSlhDsaPublicKey(publicKeyHex)) return 'SLH-DSA';
    if (isValidEcdsaPublicKey(publicKeyHex)) return 'ECDSA';
    if (isValidEvmAddress(publicKeyHex)) return 'EVM-Address';
    return null;
}
