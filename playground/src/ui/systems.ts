/** System names and colours from the main viewer (app/anatomy.ts), so both pages describe structures alike. */
export const SYSTEMS: Record<string, { name: string; color: string }> = {
  skeletal: { name: 'Skeleton', color: '#e2d9ba' }, muscular: { name: 'Muscles', color: '#a85b50' },
  cardiac: { name: 'Heart', color: '#b96760' }, sensory: { name: 'Sensory organs', color: '#b0c8ce' },
  arterial: { name: 'Arteries', color: '#c05245' }, venous: { name: 'Veins', color: '#527c9f' },
  nervous: { name: 'Nervous system', color: '#d8b565' }, respiratory: { name: 'Respiratory', color: '#b98991' },
  digestive: { name: 'Digestive', color: '#b8916b' }, urinary: { name: 'Urinary', color: '#b47961' },
  lymphatic: { name: 'Lymphatic', color: '#879f7c' }, endocrine: { name: 'Endocrine', color: '#c5a09a' },
  reproductive: { name: 'Reproductive', color: '#bda098' }, integumentary: { name: 'Body surface', color: '#ba9b7d' },
  connective: { name: 'Connective tissue', color: '#aec3bb' },
}

export const systemName = (id: string) => SYSTEMS[id]?.name ?? id
export const systemColor = (id: string) => SYSTEMS[id]?.color ?? '#a4a9b0'

/** "Head of Fibula" → "Head of fibula": sentence case for names that arrive in title case. */
export function sentence(text: string) {
  return text.replace(/(?<=\s)([A-Z])([a-z]+)/g, (word, first: string, rest: string) => (word === word.toUpperCase() ? word : first.toLowerCase() + rest))
}
