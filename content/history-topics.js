/**
 * Encyclopedia articles about how people actually lived.
 *
 * The on-this-day feed answers "what happened on this date", which is
 * inherently a feed of important occurrences — battles, treaties, coups. This
 * list answers a different question: how bread was made, how a city got its
 * water, what a merchant carried and what it cost him. No anniversary, no
 * significance test, just something worth knowing.
 *
 * Curated titles rather than Wikipedia categories. Category membership is
 * noisy — "History of agriculture" contains the 2022 Philippine onion crisis —
 * and several plausible category names simply do not exist. A list is smaller
 * but every entry is deliberate.
 *
 * Weighted towards the ancient and medieval world, which the anniversary feed
 * covers thinly.
 */
export const HISTORY_TOPICS = [
  // ---- Mesopotamia and the first cities ----
  { title: 'Cuneiform', era: 'Mesopotamia' },
  { title: 'Code_of_Hammurabi', era: 'Mesopotamia' },
  { title: 'Library_of_Ashurbanipal', era: 'Mesopotamia' },
  { title: 'Ziggurat', era: 'Mesopotamia' },
  { title: 'Sumer', era: 'Mesopotamia' },
  { title: 'Epic_of_Gilgamesh', era: 'Mesopotamia' },
  { title: 'Babylonian_astronomy', era: 'Mesopotamia' },
  { title: 'Sexagesimal', era: 'Mesopotamia' },

  // ---- Ancient Egypt ----
  { title: 'Ancient_Egyptian_cuisine', era: 'Ancient Egypt' },
  { title: 'Ancient_Egyptian_technology', era: 'Ancient Egypt' },
  { title: 'Mummy', era: 'Ancient Egypt' },
  { title: 'Rosetta_Stone', era: 'Ancient Egypt' },
  { title: 'Egyptian_hieroglyphs', era: 'Ancient Egypt' },
  { title: 'Nile', era: 'Ancient Egypt' },
  { title: 'Great_Pyramid_of_Giza', era: 'Ancient Egypt' },
  { title: 'Papyrus', era: 'Ancient Egypt' },
  { title: 'Deir_el-Medina', era: 'Ancient Egypt' },
  { title: 'Book_of_the_Dead', era: 'Ancient Egypt' },
  { title: 'Shabti', era: 'Ancient Egypt' },

  // ---- Greece ----
  { title: 'Antikythera_mechanism', era: 'Ancient Greece' },
  { title: 'Ancient_Greek_cuisine', era: 'Ancient Greece' },
  { title: 'Symposium', era: 'Ancient Greece' },
  { title: 'Ostracism', era: 'Ancient Greece' },
  { title: 'Ancient_Olympic_Games', era: 'Ancient Greece' },
  { title: 'Trireme', era: 'Ancient Greece' },
  { title: 'Library_of_Alexandria', era: 'Ancient Greece' },
  { title: 'Hippocratic_Oath', era: 'Ancient Greece' },
  { title: 'Agora', era: 'Ancient Greece' },
  { title: 'Greek_fire', era: 'Byzantium' },

  // ---- Rome ----
  { title: 'Roman_concrete', era: 'Ancient Rome' },
  { title: 'Roman_aqueduct', era: 'Ancient Rome' },
  { title: 'Thermae', era: 'Ancient Rome' },
  { title: 'Garum', era: 'Ancient Rome' },
  { title: 'Roman_roads', era: 'Ancient Rome' },
  { title: 'Insula_(building)', era: 'Ancient Rome' },
  { title: 'Roman_currency', era: 'Ancient Rome' },
  { title: 'Vindolanda_tablets', era: 'Ancient Rome' },
  { title: 'Cursus_publicus', era: 'Ancient Rome' },
  { title: 'Roman_funerary_practices', era: 'Ancient Rome' },
  { title: 'Pompeii', era: 'Ancient Rome' },
  { title: 'Culture_of_ancient_Rome', era: 'Ancient Rome' },
  { title: 'Roman_legion', era: 'Ancient Rome' },
  { title: 'Colosseum', era: 'Ancient Rome' },

  // ---- China ----
  { title: 'Terracotta_Army', era: 'Imperial China' },
  { title: 'Grand_Canal_(China)', era: 'Imperial China' },
  { title: 'Great_Wall_of_China', era: 'Imperial China' },
  { title: 'Chinese_ceramics', era: 'Imperial China' },
  { title: 'Woodblock_printing', era: 'Imperial China' },
  { title: 'Gunpowder', era: 'Imperial China' },
  { title: 'Imperial_examination', era: 'Imperial China' },
  { title: 'Chinese_paper_money', era: 'Imperial China' },
  { title: 'Silk', era: 'Imperial China' },
  { title: 'Compass', era: 'Imperial China' },

  // ---- India, Persia, the Islamic world ----
  { title: 'Indus_Valley_Civilisation', era: 'South Asia' },
  { title: 'Ayurveda', era: 'South Asia' },
  { title: 'Nalanda', era: 'South Asia' },
  { title: 'Qanat', era: 'Persia' },
  { title: 'Persian_Royal_Road', era: 'Persia' },
  { title: 'Achaemenid_Empire', era: 'Persia' },
  { title: 'House_of_Wisdom', era: 'Islamic Golden Age' },
  { title: 'Astrolabe', era: 'Islamic Golden Age' },
  { title: 'Algebra', era: 'Islamic Golden Age' },
  { title: 'Damascus_steel', era: 'Islamic Golden Age' },
  { title: 'Caravanserai', era: 'Islamic Golden Age' },
  { title: 'Islamic_geometric_patterns', era: 'Islamic Golden Age' },

  // ---- The Americas ----
  { title: 'Chinampa', era: 'Mesoamerica' },
  { title: 'Aztec_cuisine', era: 'Mesoamerica' },
  { title: 'Maya_script', era: 'Mesoamerica' },
  { title: 'Mesoamerican_ballgame', era: 'Mesoamerica' },
  { title: 'Quipu', era: 'Andes' },
  { title: 'Inca_road_system', era: 'Andes' },
  { title: 'Machu_Picchu', era: 'Andes' },
  { title: 'Terrace_(agriculture)', era: 'Andes' },

  // ---- Africa ----
  { title: 'Trans-Saharan_trade', era: 'Africa' },
  { title: 'Mali_Empire', era: 'Africa' },
  { title: 'Timbuktu', era: 'Africa' },
  { title: 'Great_Zimbabwe', era: 'Africa' },
  { title: 'Kingdom_of_Kush', era: 'Africa' },
  { title: 'Aksumite_Empire', era: 'Africa' },
  { title: 'Benin_Bronzes', era: 'Africa' },

  // ---- Medieval Europe ----
  { title: 'Medieval_cuisine', era: 'Medieval Europe' },
  { title: 'Trial_by_ordeal', era: 'Medieval Europe' },
  { title: 'Guild', era: 'Medieval Europe' },
  { title: 'Black_Death', era: 'Medieval Europe' },
  { title: 'Feudalism', era: 'Medieval Europe' },
  { title: 'Scriptorium', era: 'Medieval Europe' },
  { title: 'Illuminated_manuscript', era: 'Medieval Europe' },
  { title: 'Domesday_Book', era: 'Medieval Europe' },
  { title: 'Hanseatic_League', era: 'Medieval Europe' },
  { title: 'Windmill', era: 'Medieval Europe' },
  { title: 'Water_mill', era: 'Medieval Europe' },
  { title: 'Longbow', era: 'Medieval Europe' },
  { title: 'Castle', era: 'Medieval Europe' },
  { title: 'Monastery', era: 'Medieval Europe' },

  // ---- Norse ----
  { title: 'Viking_ships', era: 'Viking Age' },
  { title: 'Norse_colonization_of_North_America', era: 'Viking Age' },
  { title: 'Thing_(assembly)', era: 'Viking Age' },
  { title: 'Runestone', era: 'Viking Age' },

  // ---- Trade and the connected world ----
  { title: 'Silk_Road', era: 'Trade' },
  { title: 'Spice_trade', era: 'Trade' },
  { title: 'Amber_Road', era: 'Trade' },
  { title: 'Incense_trade_route', era: 'Trade' },
  { title: 'Columbian_exchange', era: 'Trade' },
  { title: 'Triangular_trade', era: 'Trade' },
  { title: 'Age_of_Discovery', era: 'Trade' },
  { title: 'Dutch_East_India_Company', era: 'Trade' },

  // ---- How the world was measured and recorded ----
  { title: 'History_of_writing', era: 'Ideas' },
  { title: 'History_of_cartography', era: 'Ideas' },
  { title: 'Printing_press', era: 'Ideas' },
  { title: 'Calendar', era: 'Ideas' },
  { title: 'Gregorian_calendar', era: 'Ideas' },
  { title: 'History_of_mathematics', era: 'Ideas' },
  { title: 'Alchemy', era: 'Ideas' },
  { title: 'Scientific_Revolution', era: 'Ideas' },
  { title: 'Encyclopédie', era: 'Ideas' },
  { title: 'Metre', era: 'Ideas' },

  // ---- Everyday life across periods ----
  { title: 'History_of_agriculture', era: 'Everyday life' },
  { title: 'History_of_bread', era: 'Everyday life' },
  { title: 'History_of_beer', era: 'Everyday life' },
  { title: 'History_of_wine', era: 'Everyday life' },
  { title: 'History_of_coffee', era: 'Everyday life' },
  { title: 'History_of_tea', era: 'Everyday life' },
  { title: 'History_of_salt', era: 'Everyday life' },
  { title: 'History_of_sugar', era: 'Everyday life' },
  { title: 'History_of_clothing_and_textiles', era: 'Everyday life' },
  { title: 'History_of_medicine', era: 'Everyday life' },
  { title: 'History_of_money', era: 'Everyday life' },
  { title: 'Sanitation_in_ancient_Rome', era: 'Everyday life' },
  { title: 'History_of_soap', era: 'Everyday life' },
  { title: 'Domestication', era: 'Everyday life' },
  { title: 'History_of_navigation', era: 'Everyday life' },
  { title: 'Slavery_in_antiquity', era: 'Everyday life' },
  { title: 'Childhood_in_the_Middle_Ages', era: 'Everyday life' },
  { title: 'Bathing', era: 'Everyday life' },
  { title: 'History_of_glass', era: 'Everyday life' },
  { title: 'Metallurgy', era: 'Everyday life' },
  { title: 'Bronze_Age', era: 'Everyday life' },
  { title: 'Iron_Age', era: 'Everyday life' },
  { title: 'Neolithic_Revolution', era: 'Everyday life' },
]
