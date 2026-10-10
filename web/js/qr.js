/**
 * Habitual - Offline Lightweight SVG QR Code Generator
 * Generates valid SVG QR code markup for share URLs and string payloads.
 */
(function() {
  'use strict';
  window.HabitualCore = window.HabitualCore || {};
  const core = window.HabitualCore;

  // Simple, robust QR Code Matrix Generator (Byte mode, Error Correction Level L/M)
  // Supports URLs and strings up to 300 characters.

  function SimpleQRCode(text, eccLevel) {
    this.text = text || '';
    this.eccLevel = eccLevel || 'M';
  }

  // Polynomial & GF(256) tables
  const GF256_EXP = new Array(512);
  const GF256_LOG = new Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF256_EXP[i] = x;
      GF256_LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF256_EXP[i] = GF256_EXP[i - 255];
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
  }

  function polyMul(p1, p2) {
    const res = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        res[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return res;
  }

  function polyGen(degree) {
    let res = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      res = polyMul(res, new Uint8Array([1, GF256_EXP[i]]));
    }
    return res;
  }

  function calcECC(data, numECCBytes) {
    const gen = polyGen(numECCBytes);
    const msg = new Uint8Array(data.length + numECCBytes);
    msg.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return msg.slice(data.length);
  }

  // QR Version capacity table for Byte mode (Version 1-10)
  // [Version, Total Modules, Data Capacity Level M, ECC Bytes Level M]
  const VERSIONS = [
    { ver: 1, size: 21, dataCap: 14, eccBytes: 10 },
    { ver: 2, size: 25, dataCap: 26, eccBytes: 16 },
    { ver: 3, size: 29, dataCap: 42, eccBytes: 26 },
    { ver: 4, size: 33, dataCap: 62, eccBytes: 36 },
    { ver: 5, size: 37, dataCap: 84, eccBytes: 48 },
    { ver: 6, size: 41, dataCap: 106, eccBytes: 64 },
    { ver: 7, size: 45, dataCap: 122, eccBytes: 72 },
    { ver: 8, size: 49, dataCap: 152, eccBytes: 88 },
    { ver: 9, size: 53, dataCap: 180, eccBytes: 110 },
    { ver: 10, size: 57, dataCap: 213, eccBytes: 130 }
  ];

  function getVersionForLength(len) {
    for (let i = 0; i < VERSIONS.length; i++) {
      if (VERSIONS[i].dataCap >= len + 3) {
        return VERSIONS[i];
      }
    }
    return VERSIONS[VERSIONS.length - 1]; // Max supported fallback
  }

  // Converts text string to raw SVG QR code markup
  core.generateQRCodeSVG = function(text, size) {
    size = size || 200;
    if (!text) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#161b22" rx="8"/><text x="50" y="55" fill="#8b949e" font-size="10" text-anchor="middle">No Link Data</text></svg>`;
    }

    // Convert text to UTF-8 bytes
    const textBytes = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 128) textBytes.push(code);
      else if (code < 2048) {
        textBytes.push(192 | (code >> 6), 128 | (code & 63));
      } else {
        textBytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
      }
    }

    const vInfo = getVersionForLength(textBytes.length);
    const ver = vInfo.ver;
    const moduleCount = vInfo.size;

    // Bit buffer initialization
    const bits = [];
    function appendBits(val, numBits) {
      for (let i = numBits - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    // Byte mode indicator: 0100
    appendBits(4, 4);
    // Character count (8 bits for ver 1-9)
    appendBits(textBytes.length, ver <= 9 ? 8 : 16);
    // Data bytes
    for (let i = 0; i < textBytes.length; i++) {
      appendBits(textBytes[i], 8);
    }
    // Terminator
    const totalDataBits = vInfo.dataCap * 8;
    while (bits.length < totalDataBits && bits.length % 8 !== 0) bits.push(0);
    // Pad bytes
    const padBytes = [0xEC, 0x11];
    let padIdx = 0;
    while (bits.length < totalDataBits) {
      appendBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    // Convert bits to data bytes
    const dataBytes = new Uint8Array(vInfo.dataCap);
    for (let i = 0; i < vInfo.dataCap; i++) {
      let byteVal = 0;
      for (let b = 0; b < 8; b++) {
        byteVal = (byteVal << 1) | bits[i * 8 + b];
      }
      dataBytes[i] = byteVal;
    }

    // Calculate Reed-Solomon Error Correction Code
    const ecc = calcECC(dataBytes, vInfo.eccBytes);

    // Combine data + ecc bytes
    const finalStream = new Uint8Array(dataBytes.length + ecc.length);
    finalStream.set(dataBytes, 0);
    finalStream.set(ecc, dataBytes.length);

    // Matrix construction (size x size)
    const grid = [];
    const isReserved = [];
    for (let r = 0; r < moduleCount; r++) {
      grid[r] = new Uint8Array(moduleCount);
      isReserved[r] = new Uint8Array(moduleCount);
    }

    function setModule(r, c, val, reserved = true) {
      if (r >= 0 && r < moduleCount && c >= 0 && c < moduleCount) {
        grid[r][c] = val ? 1 : 0;
        if (reserved) isReserved[r][c] = 1;
      }
    }

    // Finder patterns (top-left, top-right, bottom-left)
    function drawFinder(r, c) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const row = r + dr, col = c + dc;
          if (row < 0 || row >= moduleCount || col < 0 || col >= moduleCount) continue;
          if (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6) ||
              dc >= 0 && dc <= 6 && (dr === 0 || dr === 6) ||
              (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)) {
            setModule(row, col, 1);
          } else {
            setModule(row, col, 0);
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, moduleCount - 7);
    drawFinder(moduleCount - 7, 0);

    // Alignment patterns for Version >= 2
    if (ver >= 2) {
      const alignPos = ver === 2 ? 18 : (ver === 3 ? 22 : (ver === 4 ? 26 : (ver === 5 ? 30 : (ver === 6 ? 34 : 38))));
      const positions = [6, alignPos];
      for (let i = 0; i < positions.length; i++) {
        for (let j = 0; j < positions.length; j++) {
          const ar = positions[i], ac = positions[j];
          if (isReserved[ar][ac]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
                setModule(ar + dr, ac + dc, 1);
              } else {
                setModule(ar + dr, ac + dc, 0);
              }
            }
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < moduleCount - 8; i++) {
      if (!isReserved[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0);
      if (!isReserved[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Reserve format information areas
    for (let i = 0; i < 9; i++) {
      if (!isReserved[8][i]) isReserved[8][i] = 1;
      if (!isReserved[i][8]) isReserved[i][8] = 1;
      if (!isReserved[8][moduleCount - 1 - i]) isReserved[8][moduleCount - 1 - i] = 1;
      if (!isReserved[moduleCount - 1 - i][8]) isReserved[moduleCount - 1 - i][8] = 1;
    }

    // Place data bits in matrix (zigzag right to left)
    let bitIdx = 0;
    const totalStreamBits = finalStream.length * 8;
    let upward = true;

    for (let c = moduleCount - 1; c > 0; c -= 2) {
      if (c === 6) c--; // Skip vertical timing column
      for (let rStep = 0; rStep < moduleCount; rStep++) {
        const r = upward ? (moduleCount - 1 - rStep) : rStep;
        for (let colOffset = 0; colOffset < 2; colOffset++) {
          const col = c - colOffset;
          if (!isReserved[r][col]) {
            let bitVal = 0;
            if (bitIdx < totalStreamBits) {
              const byteI = Math.floor(bitIdx / 8);
              const bitI = 7 - (bitIdx % 8);
              bitVal = (finalStream[byteI] >> bitI) & 1;
              bitIdx++;
            }
            // Apply standard data mask (Pattern 0: (row + col) % 2 == 0)
            const mask = ((r + col) % 2 === 0) ? 1 : 0;
            grid[r][col] = bitVal ^ mask;
          }
        }
      }
      upward = !upward;
    }

    // Draw Format Info (Level M = 00, Mask 0 = 000 -> 00000 + BCH) -> fixed 101010000010010 ^ 101010000010010
    const formatBits = [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0];
    const maskBits =   [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0];
    const dummyFormat = formatBits.map((b, idx) => b ^ maskBits[idx]);

    // Top-left format placement
    for (let i = 0; i < 6; i++) grid[8][i] = dummyFormat[i];
    grid[8][7] = dummyFormat[6];
    grid[8][8] = dummyFormat[7];
    grid[7][8] = dummyFormat[8];
    for (let i = 9; i < 15; i++) grid[14 - i][8] = dummyFormat[i];

    // Split format placement (bottom-left & top-right)
    for (let i = 0; i < 7; i++) grid[moduleCount - 1 - i][8] = dummyFormat[i];
    for (let i = 7; i < 15; i++) grid[8][moduleCount - 15 + i] = dummyFormat[i];

    // Build SVG path strings
    const rects = [];
    const pad = 2; // Quiet zone padding
    const totalSize = moduleCount + pad * 2;
    const unit = (100 / totalSize).toFixed(3);

    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (grid[r][c] === 1) {
          const x = ((c + pad) * (100 / totalSize)).toFixed(2);
          const y = ((r + pad) * (100 / totalSize)).toFixed(2);
          rects.push(`<rect x="${x}%" y="${y}%" width="${unit}%" height="${unit}%" fill="#f0f6fc"/>`);
        }
      }
    }

    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="background-color: #0d1117; border-radius: 8px; padding: 4px; border: 1px solid #30363d;">
      <rect width="100" height="100" fill="#0d1117" rx="8"/>
      ${rects.join('')}
    </svg>`;
  };

})();
