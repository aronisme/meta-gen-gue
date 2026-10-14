// lib/categories.ts

export interface CategoryItem {
  code: string;
  name: string;
  description?: string;
  noVideo?: boolean;
}

/**
 * Official 21 Adobe Stock categories with numeric codes.
 * Ref: Adobe Stock Contributor Guidelines 2026.
 */
export const ADOBE_STOCK_CATEGORIES: CategoryItem[] = [
  { code: '1', name: 'Animals', description: 'Animals, insects, pets, wildlife' },
  { code: '2', name: 'Buildings and Architecture', description: 'Interiors, structures, architecture' },
  { code: '3', name: 'Business', description: 'Offices, finance, professional activities' },
  { code: '4', name: 'Drinks', description: 'Beverages, coffee, cocktails' },
  { code: '5', name: 'The Environment', description: 'Nature, ecology, weather, climate' },
  { code: '6', name: 'States of Mind', description: 'Emotions, inner thoughts, concepts' },
  { code: '7', name: 'Food', description: 'Culinary, cooking, dishes, food ingredients' },
  { code: '8', name: 'Graphic Resources', description: 'Backgrounds, patterns, textures, icons, vectors' },
  { code: '9', name: 'Hobbies and Leisure', description: 'Crafts, recreation, pastimes' },
  { code: '10', name: 'Industry', description: 'Manufacturing, construction, energy, logistics' },
  { code: '11', name: 'Landscape', description: 'Natural vistas, cityscapes, scenic destinations' },
  { code: '12', name: 'Lifestyle', description: 'Everyday life, home, leisure, social moments' },
  { code: '13', name: 'People', description: 'Portraits, families, diverse demographics' },
  { code: '14', name: 'Plants and Flowers', description: 'Botany, blooms, gardens, foliage' },
  { code: '15', name: 'Culture and Religion', description: 'Traditions, celebrations, faith, heritage' },
  { code: '16', name: 'Science', description: 'Research, medicine, innovation, lab' },
  { code: '17', name: 'Social Issues', description: 'Activism, inequality, community, awareness' },
  { code: '18', name: 'Sports', description: 'Athletics, fitness, exercise, competition' },
  { code: '19', name: 'Technology', description: 'Gadgets, computing, software, digital world' },
  { code: '20', name: 'Transport', description: 'Vehicles, roads, infrastructure, transit' },
  { code: '21', name: 'Travel', description: 'Tourism, vacations, exploration, landmarks' },
];

/**
 * Official 26 Shutterstock categories.
 * Ref: Shutterstock Content Publishing Standards: Contextual Metadata (2026).
 */
export const SHUTTERSTOCK_CATEGORIES: CategoryItem[] = [
  { code: 'Abstract', name: 'Abstract', noVideo: true },
  { code: 'Animals/Wildlife', name: 'Animals/Wildlife' },
  { code: 'Arts', name: 'Arts' },
  { code: 'Backgrounds/Textures', name: 'Backgrounds/Textures' },
  { code: 'Beauty/Fashion', name: 'Beauty/Fashion', noVideo: true },
  { code: 'Buildings/Landmarks', name: 'Buildings/Landmarks' },
  { code: 'Business/Finance', name: 'Business/Finance' },
  { code: 'Celebrities', name: 'Celebrities', noVideo: true },
  { code: 'Education', name: 'Education' },
  { code: 'Food and Drink', name: 'Food and Drink' },
  { code: 'Healthcare/Medical', name: 'Healthcare/Medical' },
  { code: 'Holidays', name: 'Holidays' },
  { code: 'Industrial', name: 'Industrial' },
  { code: 'Interiors', name: 'Interiors', noVideo: true },
  { code: 'Miscellaneous', name: 'Miscellaneous', noVideo: true },
  { code: 'Nature', name: 'Nature' },
  { code: 'Objects', name: 'Objects' },
  { code: 'Parks/Outdoor', name: 'Parks/Outdoor', noVideo: true },
  { code: 'People', name: 'People' },
  { code: 'Religion', name: 'Religion' },
  { code: 'Science', name: 'Science' },
  { code: 'Signs/Symbols', name: 'Signs/Symbols' },
  { code: 'Sports/Recreation', name: 'Sports/Recreation' },
  { code: 'Technology', name: 'Technology' },
  { code: 'Transportation', name: 'Transportation' },
  { code: 'Vintage', name: 'Vintage', noVideo: true },
];

/**
 * Maps Adobe Stock numeric category code to closest Shutterstock category name.
 */
export function mapAdobeToShutterstock(adobeCode: string): string {
  const map: Record<string, string> = {
    '1': 'Animals/Wildlife',
    '2': 'Buildings/Landmarks',
    '3': 'Business/Finance',
    '4': 'Food and Drink',
    '5': 'Nature',
    '6': 'Abstract',
    '7': 'Food and Drink',
    '8': 'Backgrounds/Textures',
    '9': 'Sports/Recreation',
    '10': 'Industrial',
    '11': 'Parks/Outdoor',
    '12': 'People',
    '13': 'People',
    '14': 'Nature',
    '15': 'Religion',
    '16': 'Science',
    '17': 'People',
    '18': 'Sports/Recreation',
    '19': 'Technology',
    '20': 'Transportation',
    '21': 'Buildings/Landmarks',
  };
  return map[adobeCode] || 'Miscellaneous';
}

/**
 * Maps Shutterstock category name to closest Adobe Stock category numeric code.
 */
export function mapShutterstockToAdobe(shutterstockCategory: string): string {
  const map: Record<string, string> = {
    'Animals/Wildlife': '1',
    'Buildings/Landmarks': '2',
    'Business/Finance': '3',
    'Food and Drink': '7',
    'Nature': '5',
    'Abstract': '6',
    'Backgrounds/Textures': '8',
    'Sports/Recreation': '18',
    'Industrial': '10',
    'Parks/Outdoor': '11',
    'People': '13',
    'Religion': '15',
    'Science': '16',
    'Technology': '19',
    'Transportation': '20',
    'Healthcare/Medical': '16',
    'Interiors': '2',
    'Holidays': '15',
    'Education': '3',
    'Signs/Symbols': '8',
    'Arts': '8',
  };
  return map[shutterstockCategory] || '8';
}
