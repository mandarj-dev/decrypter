from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def derive_key_and_iv(password, salt, key_length=32, iv_length=16):
    """OpenSSL-compatible key/iv derivation (MD5 EVP_BytesToKey)."""
    d = d_i = b""
    while len(d) < key_length + iv_length:
        d_i = hashlib.md5(d_i + password + salt).digest()
        d += d_i
    return d[:key_length], d[key_length:key_length + iv_length]

def decrypt_aes(encrypted_data: str, secret_key: str) -> str:
    """Decrypt a Base64 string produced by CryptoJS AES (CBC, PKCS7) with OpenSSL salt header."""
    try:
        encrypted_bytes = base64.b64decode(encrypted_data)
        if encrypted_bytes[:8] != b'Salted__':
            raise ValueError("Invalid data format (missing 'Salted__')")
        
        salt = encrypted_bytes[8:16]
        ciphertext = encrypted_bytes[16:]
        
        key, iv = derive_key_and_iv(secret_key.encode('utf-8'), salt)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_padded = cipher.decrypt(ciphertext)
        decrypted = unpad(decrypted_padded, AES.block_size)
        
        return decrypted.decode('utf-8')
    except Exception as e:
        raise Exception(f"Decryption failed: {str(e)}")

@app.route('/api/decrypt', methods=['POST'])
def decrypt():
    """API endpoint to decrypt encrypted data."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        key = data.get('key', '').strip()
        encrypted_data = data.get('data', '').strip()
        
        if not key or not encrypted_data:
            return jsonify({
                'success': False,
                'error': 'Both "key" and "data" fields are required'
            }), 400
        
        decrypted = decrypt_aes(encrypted_data, key)
        
        return jsonify({
            'success': True,
            'decrypted': decrypted
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

