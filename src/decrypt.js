import CryptoJS from 'crypto-js';

/**
 * Decrypt AES-encrypted data (CryptoJS format with OpenSSL salt header)
 * @param {string} encryptedData - Base64-encoded encrypted data
 * @param {string} secretKey - Secret key for decryption
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails
 */
export function decryptAES(encryptedData, secretKey) {
  try {
    // CryptoJS handles the OpenSSL salt format automatically
    const decrypted = CryptoJS.AES.decrypt(encryptedData, secretKey);
    
    // Convert to UTF-8 string
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedText) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }
    
    return decryptedText;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Validate if a string is valid Base64
 * @param {string} str - String to validate
 * @returns {boolean} True if valid Base64
 */
export function isValidBase64(str) {
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

