// Simple script to generate PWA icons
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Create a simple SVG-based icon
const createIconSVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.25}" fill="#6366f1"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.3}" fill="white" opacity="0.9"/>
  <rect x="${size * 0.35}" y="${size * 0.4}" width="${size * 0.3}" height="${size * 0.4}" rx="${size * 0.05}" fill="#6366f1"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.12}" fill="white"/>
</svg>`;

// For now, we'll use SVG files that browsers can handle
// In production, convert these to PNG using a tool like sharp or imagemagick

const publicDir = path.join(__dirname, '..', 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create SVG icons (browsers can use these)
fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), createIconSVG(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), createIconSVG(512));

console.log('✓ Icon SVGs created');
console.log('Note: For full PWA support, convert SVGs to PNGs using a tool like sharp or imagemagick');
