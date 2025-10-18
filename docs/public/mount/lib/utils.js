/**
 * Get the Base32 alphabet.
 * @returns {string}
 */
export const getBase32Alphabet = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Clean and normalize the base32 input string.
 * - Removes padding
 * - Converts to uppercase
 * @param {string} input
 * @returns {string}
 */
const normalizeBase32String = (input) =>
  input.replace(/=+$/, '').toUpperCase();

/**
 * Convert a base32 character to its corresponding 5-bit binary string.
 * @param {string} char
 * @param {string} alphabet
 * @returns {string}
 */
const charToBits = (char, alphabet) => {
  const index = alphabet.indexOf(char);
  if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
  return index.toString(2).padStart(5, '0');
};

/**
 * Convert a full base32 string into a binary string.
 * @param {string} base32
 * @param {string} alphabet
 * @returns {string}
 */
const base32ToBitString = (base32, alphabet) =>
  [...base32].map((char) => charToBits(char, alphabet)).join('');

/**
 * Convert a bit string into an array of bytes.
 * @param {string} bitString
 * @returns {number[]}
 */
const bitStringToBytes = (bitString) => {
  const bytes = [];
  for (let i = 0; i + 8 <= bitString.length; i += 8) {
    bytes.push(parseInt(bitString.slice(i, i + 8), 2));
  }
  return bytes;
};

/**
 * Convert a base32 encoded string to a Uint8Array of bytes.
 * @param {string} base32
 * @returns {Uint8Array}
 */
export const base32ToBytes = (base32) => {
  const alphabet = getBase32Alphabet();
  const normalized = normalizeBase32String(base32);
  const bitString = base32ToBitString(normalized, alphabet);
  const byteArray = bitStringToBytes(bitString);
  return new Uint8Array(byteArray);
};

// Object.assign(exports, {
//   getBase32Alphabet,
//   base32ToBytes
// })

export default {getBase32Alphabet, base32ToBytes}

