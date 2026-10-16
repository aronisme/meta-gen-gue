export interface InspirationIdea {
  id: string;
  title: string;
  brief: string;
  category?: string;
  isAiGenerated?: boolean;
}

export const CURATED_INSPIRATION_POOL: InspirationIdea[] = [
  // 1. Bisnis, AI & Modern Work
  {
    id: 'work-ai-1',
    category: 'Bisnis & AI',
    title: 'Pekerja Profesional & AI',
    brief: 'Asian female data scientist collaborating with futuristic holographic analytics in a bright glass modern office, candid smile, commercial lifestyle',
  },
  {
    id: 'work-startup-2',
    category: 'Bisnis & AI',
    title: 'Kolaborasi Startup Hybrid',
    brief: 'Diverse young tech entrepreneurs discussing product roadmap around a rustic wooden table with laptops and paper sketches, natural morning window light',
  },
  {
    id: 'work-finance-3',
    category: 'Bisnis & AI',
    title: 'Finansial & Investasi Digital',
    brief: 'Young businessman checking glowing cryptocurrency trading charts on smartphone with panoramic night cityscape bokeh, confident expression',
  },
  {
    id: 'work-logistics-4',
    category: 'Bisnis & AI',
    title: 'Logistik & Smart Warehouse',
    brief: 'Modern logistics fulfillment center with automated robotic conveyors and supervisor checking digital tablet inventory, cinematic clean perspective',
  },

  // 2. Keberlanjutan & Teknologi Hijau
  {
    id: 'green-energy-1',
    category: 'Energi Hijau',
    title: 'Energi Hijau Terbarukan',
    brief: 'Engineers in clean safety gear inspecting solar panel fields and wind turbines under dramatic sunset clouds, sustainable clean technology',
  },
  {
    id: 'green-agritech-2',
    category: 'Energi Hijau',
    title: 'Smart Farming Presisi',
    brief: 'Innovative agritech farmer holding tablet inspecting vertical indoor hydroponic lettuce farm, bright natural LED glow, crisp organic foliage',
  },
  {
    id: 'green-zerowaste-3',
    category: 'Energi Hijau',
    title: 'Daur Ulang & Zero Waste',
    brief: 'Eco-conscious young family sorting glass bottles and paper for recycling at minimalist home kitchen, bright airy Scandinavian aesthetic',
  },
  {
    id: 'green-ev-4',
    category: 'Energi Hijau',
    title: 'Mobil Listrik & Clean Transit',
    brief: 'Sleek electric vehicle plugged into ultra-fast solar charging station at twilight, subtle neon accent light, modern sustainable transport',
  },

  // 3. Kemewahan & Produk Komersial
  {
    id: 'prod-skincare-1',
    category: 'Produk & Still Life',
    title: 'Produk Mewah Minimalis',
    brief: 'Luxury organic skincare glass bottle on wet volcanic stone with gentle water ripples, dramatic soft side lighting, ample negative copy space',
  },
  {
    id: 'prod-perfume-2',
    category: 'Produk & Still Life',
    title: 'Parfum & Bayangan Floral',
    brief: 'Elegant minimalist perfume glass bottle casting soft botanical shadows across beige textured stucco wall, warm golden morning sunbeam',
  },
  {
    id: 'prod-ceramic-3',
    category: 'Produk & Still Life',
    title: 'Keramik Artisan Handcrafted',
    brief: 'Potter hands gently shaping wet earthenware ceramic bowl on spinning pottery wheel, tactile clay textures, warm soft workshop ambient lighting',
  },
  {
    id: 'prod-interior-4',
    category: 'Produk & Still Life',
    title: 'Interior Japandi Minimalis',
    brief: 'Peaceful minimalist sunlit living room with low natural oak furniture, single bonsai plant, beige linen textures, serene zen atmosphere',
  },

  // 4. Kuliner & Lifestyle
  {
    id: 'food-coffee-1',
    category: 'Kuliner & Kafe',
    title: 'Kuliner & Artisan Kopi',
    brief: 'Barista pouring hot water over fresh artisanal coffee filter, steam rising in rustic cafe morning light, macro roasted coffee bean textures',
  },
  {
    id: 'food-street-2',
    category: 'Kuliner & Kafe',
    title: 'Street Food Wok Action',
    brief: 'Asian chef tossing colorful fresh vegetables and noodles in flaming wok at bustling evening street market, dynamic sparks, appetizing steam',
  },
  {
    id: 'food-bakery-3',
    category: 'Kuliner & Kafe',
    title: 'Sourdough & Sarapan Sehat',
    brief: 'Artisanal crusty sourdough loaf with organic sliced avocado and poached egg on handmade ceramic plate, rustic morning breakfast table flatlay',
  },
  {
    id: 'food-mocktail-4',
    category: 'Kuliner & Kafe',
    title: 'Minuman Segar Tropis',
    brief: 'Tall glass of sparkling citrus tropical mocktail with fresh mint leaves and frosty condensation droplets, golden hour sunlight flare',
  },

  // 5. Kesehatan, Medis & Wellness
  {
    id: 'health-running-1',
    category: 'Kesehatan & Wellness',
    title: 'Kesehatan & Gaya Hidup',
    brief: 'Young athletic man stretching in lush morning city park, natural lens flare, authentic candid athleticism, clean background for typography',
  },
  {
    id: 'health-yoga-2',
    category: 'Kesehatan & Wellness',
    title: 'Yoga & Ketenangan Jiwa',
    brief: 'Woman meditating in serene minimalist room with bamboo floor and soft morning light beams, mindful calm atmosphere, peaceful pose',
  },
  {
    id: 'health-telemed-3',
    category: 'Kesehatan & Wellness',
    title: 'Telemedicine Modern',
    brief: 'Smiling friendly female doctor in white coat consulting patient via laptop webcam, bright clean modern clinic office background',
  },
  {
    id: 'health-biotech-4',
    category: 'Kesehatan & Wellness',
    title: 'Laboratorium Bioteknologi',
    brief: 'Scientist in sterile cleanroom analyzing molecular sample under high-tech digital microscope, cool blue ambient LED lighting, precise focus',
  },

  // 6. Budaya, Wisata & Petualangan
  {
    id: 'travel-hike-1',
    category: 'Wisata & Budaya',
    title: 'Petualangan Puncak Gunung',
    brief: 'Solo hiker standing on dramatic rocky mountain ridge at sunrise overlooking endless sea of clouds, epic travel landscape, sense of freedom',
  },
  {
    id: 'travel-loom-2',
    category: 'Wisata & Budaya',
    title: 'Pengrajin Tenun Tradisional',
    brief: 'Indonesian artisan woman weaving intricate traditional ikat fabric on wooden manual handloom, rich vibrant natural dye textures, cultural heritage',
  },
  {
    id: 'travel-family-3',
    category: 'Wisata & Budaya',
    title: 'Keluarga & Dapur Hangat',
    brief: 'Happy multiracial family cooking healthy dinner together in sun-drenched open kitchen, genuine laughter and interaction, authentic lifestyle',
  },
  {
    id: 'travel-kids-4',
    category: 'Wisata & Budaya',
    title: 'Edukasi Robotika Anak',
    brief: 'Curious young elementary school students assembling colorful mini robotics circuits in modern interactive classroom, bright inspiring light',
  },

  // 7. Nusantara & Kuliner Tradisional
  {
    id: 'nusantara-satay-1',
    category: 'Kuliner Nusantara',
    title: 'Sate & Asap Arang Tradisional',
    brief: 'Traditional Indonesian street satay master fanning glowing red coconut charcoal grill, fragrant appetizing smoke rising, rich peanut glaze and shallot garnish',
  },
  {
    id: 'nusantara-coffee-2',
    category: 'Kuliner Nusantara',
    title: 'Petani Kopi Dataran Tinggi',
    brief: 'Indonesian coffee farmer proudly holding ripe red Arabica coffee cherries in hands, lush green volcanic mountain plantation backdrop at morning fog',
  },
  {
    id: 'nusantara-batik-3',
    category: 'Seni & Budaya',
    title: 'Membatik dengan Canting',
    brief: 'Close-up hands of elderly Javanese woman holding hot brass canting drawing intricate wax batik patterns on white cotton fabric, authentic heritage craft',
  },
  {
    id: 'nusantara-market-4',
    category: 'Wisata & Budaya',
    title: 'Pasar Terapung Tradisional',
    brief: 'Vibrant floating market boats loaded with colorful tropical fruits and vegetables at misty river sunrise, dynamic reflection and lively local trade',
  },

  // 8. Masa Depan, Smart City & Edukasi Modern
  {
    id: 'future-smartcity-1',
    category: 'Teknologi & Kota',
    title: 'Smart City & Mobilitas Otonom',
    brief: 'Futuristic eco-friendly metropolis with autonomous electric transit pods and elevated vertical garden skyscrapers, clean dusk sky, high-tech infrastructure',
  },
  {
    id: 'future-remote-2',
    category: 'Gaya Hidup Digital',
    title: 'Work from Anywhere Tropis',
    brief: 'Digital nomad working on sleek laptop under open bamboo gazebo overlooking lush tropical palm valley, coconut drink beside, relaxed modern productivity',
  },
  {
    id: 'future-cyber-3',
    category: 'Teknologi & Kota',
    title: 'Cybersecurity Data Shield',
    brief: 'Cybersecurity engineer monitoring multi-screen holographic security network defense grid in darkened command center, neon cyan reflections',
  },
  {
    id: 'future-vr-4',
    category: 'Gaya Hidup Digital',
    title: 'Kolaborasi Virtual Reality',
    brief: 'Architects wearing sleek lightweight mixed-reality glasses manipulating 3D building hologram together in sunlit studio, cutting-edge creative innovation',
  },
];

export function getRandomCuratedIdeas(count = 10, excludeIds: string[] = []): InspirationIdea[] {
  const available = CURATED_INSPIRATION_POOL.filter((item) => !excludeIds.includes(item.id));
  const pool = available.length >= count ? available : CURATED_INSPIRATION_POOL;

  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
