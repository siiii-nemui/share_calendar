export function getContrastYIQ(hexcolor: string) {
  // If transparent or invalid, default to black text
  if (!hexcolor || hexcolor === 'transparent' || !hexcolor.startsWith('#')) return 'text-gray-900';
  
  // Remove hash
  hexcolor = hexcolor.replace('#', '');
  
  // Convert 3-char hex to 6-char
  if (hexcolor.length === 3) {
    hexcolor = hexcolor.split('').map(char => char + char).join('');
  }
  
  if (hexcolor.length !== 6) return 'text-gray-900';
  
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  
  // YIQ equation from http://24ways.org/2010/calculating-color-contrast
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  return (yiq >= 128) ? 'text-gray-900' : 'text-white';
}