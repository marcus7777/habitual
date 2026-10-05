/*
colour from "The 24 Google Calendar calendar colors" on https://calpalette.com/google-calendar-hex-codes
*/

(function () {
  const googleCalendarColours = [
    "#795548", // Cocoa
    "#E67C73", // Flamingo
    "#D50000", // Tomato
    "#F4511E", // Tangerine
    "#EF6C00", // Pumpkin
    "#F09300", // Mango
    "#009688", // Eucalyptus
    "#0B8043", // Basil
    "#7CB342", // Pistachio
    "#C0CA33", // Avocado
    "#E4C441", // Citron
    "#F6BF26", // Banana
    "#33B679", // Sage
    "#039BE5", // Peacock
    "#4285F4", // Cobalt
    "#3F51B5", // Blueberry
    "#7986CB", // Lavender
    "#B39DDB", // Wisteria
    "#616161", // Graphite
    "#A79B8E", // Birch
    "#AD1457", // Radicchio
    "#D81B60", // Cherry Blossom
    "#8E24AA", // Grape
    "#9E69AF"  // Amethyst
  ];

  function hashString(str) {
    const s = String(str != null ? str : '');
    let hash = 5381;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function colourFromString(str) {
    if (str == null) return googleCalendarColours[0];
    const hash = hashString(str);
    const index = hash % googleCalendarColours.length;
    return googleCalendarColours[index];
  }

  function getColoursOrStringColour(input) {
    if (typeof input === 'string' || typeof input === 'number') {
      return colourFromString(input);
    }
    return googleCalendarColours.slice();
  }

  const targets = [];
  if (typeof window !== 'undefined') targets.push(window);
  if (typeof globalThis !== 'undefined') targets.push(globalThis);
  if (typeof global !== 'undefined') targets.push(global);

  targets.forEach(function (t) {
    t.colour = getColoursOrStringColour;
    t.colors = getColoursOrStringColour;
    t.colourFromString = colourFromString;
    t.colorFromString = colourFromString;
    t.getColourFromString = colourFromString;
    t.getColorFromString = colourFromString;
    t.windows = t;
  });
})();
