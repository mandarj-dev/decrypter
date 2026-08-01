import CryptoJS from 'crypto-js';

/**
 * OpenSSL EVP_BytesToKey (MD5) — same algorithm as lib/decrypt.mjs / app.py.
 */
function deriveKeyAndIv(password, salt) {
  const passBytes = CryptoJS.enc.Utf8.parse(password);
  let d = CryptoJS.lib.WordArray.create();
  let d_i = CryptoJS.lib.WordArray.create();

  while (d.sigBytes < 48) {
    d_i = CryptoJS.MD5(d_i.concat(passBytes).concat(salt));
    d = d.concat(d_i);
  }

  d.sigBytes = 48;
  const key = CryptoJS.lib.WordArray.create(d.words.slice(0, 8), 32);
  const iv = CryptoJS.lib.WordArray.create(d.words.slice(8, 12), 16);
  return { key, iv };
}

/**
 * Decrypt AES-encrypted data (CryptoJS/OpenSSL format with Salted__ header).
 * @param {string} encryptedData - Base64-encoded ciphertext
 * @param {string} secretKey - Secret key
 * @returns {string} Decrypted plaintext
 */
export function decryptAES(encryptedData, secretKey) {
  try {
    const encrypted = CryptoJS.enc.Base64.parse(encryptedData);

    if (encrypted.sigBytes < 16) {
      throw new Error("Invalid data format (missing 'Salted__')");
    }

    const header = CryptoJS.enc.Latin1.stringify(
      CryptoJS.lib.WordArray.create(encrypted.words.slice(0, 2), 8)
    );
    if (header !== 'Salted__') {
      throw new Error("Invalid data format (missing 'Salted__')");
    }

    const salt = CryptoJS.lib.WordArray.create(encrypted.words.slice(2, 4), 8);
    const ciphertext = CryptoJS.lib.WordArray.create(
      encrypted.words.slice(4),
      encrypted.sigBytes - 16
    );

    const { key, iv } = deriveKeyAndIv(secretKey, salt);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }

    return decryptedText;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}
