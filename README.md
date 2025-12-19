# Decryption Tool

A modern, client-side web-based decryption tool built with Vite and vanilla JavaScript. Decrypts Base64-encoded AES-encrypted data (CryptoJS format with OpenSSL salt header) entirely in your browser - **no backend required!**

## Features

- 🔐 Client-side AES decryption (CBC mode with PKCS7 padding)
- 🎨 Modern, responsive UI with beautiful design
- 📋 Copy, paste, and download functionality
- 🔧 JSON formatting and minification
- 🚀 Fast Vite dev server with HMR
- 🔒 100% client-side - your data never leaves your browser
- ⚡ No backend needed - pure JavaScript

## Project Structure

```
.
├── package.json          # Node dependencies
├── vite.config.js        # Vite configuration
├── index.html            # Main HTML file
└── src/
    ├── main.js           # JavaScript logic
    ├── decrypt.js        # Decryption utilities
    └── style.css         # Styles
```

## Setup & Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Quick Start

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

That's it! No backend setup required. 🎉

## Usage

1. Enter your **secret key** in the first input field
2. Paste your **Base64-encoded encrypted data** in the textarea
3. Click **Decrypt** to decrypt the data
4. Use the output panel buttons to:
   - **Copy**: Copy decrypted output to clipboard
   - **Toggle Wrap**: Toggle text wrapping
   - **Format JSON**: Beautify JSON output
   - **Minify JSON**: Compress JSON output
   - **Download**: Save output as file

## Build for Production

Build the static site:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

The built files will be in the `dist/` folder, ready to deploy to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

## How It Works

The decryption happens entirely in your browser using the **CryptoJS** library:

1. Takes Base64-encoded encrypted data
2. Extracts the OpenSSL salt header (`Salted__`)
3. Derives the key and IV using MD5 (EVP_BytesToKey)
4. Decrypts using AES-256-CBC with PKCS7 padding
5. Returns the plaintext

**Your data is never sent to any server** - all processing happens locally in your browser!

## Technologies Used

- **Frontend**: Vite, Vanilla JavaScript, CSS3
- **Encryption**: CryptoJS (AES-256-CBC with MD5 key derivation)
- **Dev Server**: Vite with HMR

## License

MIT

