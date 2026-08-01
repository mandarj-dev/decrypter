import { createDecipheriv, createHash } from 'node:crypto';

/**
 * OpenSSL-compatible key/iv derivation (MD5 EVP_BytesToKey).
 * Matches Python app.py derive_key_and_iv().
 */
export function deriveKeyAndIv(password, salt, keyLength = 32, ivLength = 16) {
  const pass = Buffer.from(password, 'utf8');
  let d = Buffer.alloc(0);
  let d_i = Buffer.alloc(0);

  while (d.length < keyLength + ivLength) {
    d_i = createHash('md5').update(Buffer.concat([d_i, pass, salt])).digest();
    d = Buffer.concat([d, d_i]);
  }

  return [d.subarray(0, keyLength), d.subarray(keyLength, keyLength + ivLength)];
}

/**
 * Decrypt Base64 CryptoJS/OpenSSL AES (CBC, PKCS7) ciphertext.
 * Matches Python app.py decrypt_aes().
 */
export function decryptAES(encryptedData, secretKey) {
  const encryptedBytes = Buffer.from(encryptedData, 'base64');

  if (!encryptedBytes.subarray(0, 8).equals(Buffer.from('Salted__'))) {
    throw new Error("Invalid data format (missing 'Salted__')");
  }

  const salt = encryptedBytes.subarray(8, 16);
  const ciphertext = encryptedBytes.subarray(16);
  const [key, iv] = deriveKeyAndIv(secretKey, salt);

  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
