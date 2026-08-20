/**
 * Wikipedia articles worth watching for sudden interest.
 *
 * Deliberately curated rather than taken from the "most viewed" endpoint. That
 * endpoint returns whatever the internet is doing — the day this was written it
 * was Hayden Panettiere, Wladimir Klitschko and Spider-Man. Ranking by raw
 * traffic measures celebrity; watching a fixed list measures whether attention
 * moved to something that matters.
 *
 * A spike here is a different signal from every other card in the feed: not
 * what an editor chose to publish, but what people went and looked up.
 */
export const WATCHLIST = [
  // ---- Maritime chokepoints: small places that move the world economy ----
  'Strait_of_Hormuz', 'Suez_Canal', 'Bab-el-Mandeb', 'Strait_of_Malacca',
  'Taiwan_Strait', 'Panama_Canal', 'Bosporus', 'Danish_straits', 'Red_Sea',
  'South_China_Sea', 'Kerch_Strait', 'Gulf_of_Aden',

  // ---- Active and frozen conflicts ----
  'Russian_invasion_of_Ukraine', 'Gaza_war', 'Syrian_civil_war',
  'Yemeni_civil_war_(2014–present)', 'Sudanese_civil_war_(2023–present)',
  'Myanmar_civil_war_(2021–present)', 'Nagorno-Karabakh_conflict',
  'Kashmir_conflict', 'Western_Sahara_conflict', 'Sahel_insurgency',
  'Israeli–Palestinian_conflict', 'Second_Nagorno-Karabakh_War',

  // ---- Institutions and alliances ----
  'NATO', 'European_Union', 'United_Nations_Security_Council',
  'BRICS', 'Organization_of_the_Petroleum_Exporting_Countries',
  'International_Monetary_Fund', 'World_Trade_Organization',
  'Shanghai_Cooperation_Organisation', 'African_Union',
  'International_Criminal_Court', 'European_Central_Bank',
  'Federal_Reserve', 'G20', 'ASEAN', 'Mercosur',

  // ---- Powers and flashpoint states ----
  'Russia', 'China', 'Taiwan', 'Iran', 'Israel', 'Ukraine', 'North_Korea',
  'Saudi_Arabia', 'Turkey', 'India', 'Pakistan', 'Egypt', 'Venezuela',
  'Nigeria', 'Ethiopia', 'Sudan', 'Myanmar', 'Belarus', 'Serbia', 'Kosovo',
  'Armenia', 'Azerbaijan', 'Georgia_(country)', 'Moldova', 'Syria', 'Lebanon',
  'Yemen', 'Iraq', 'Afghanistan', 'Libya', 'Mali', 'Niger', 'Burkina_Faso',
  'Democratic_Republic_of_the_Congo', 'Somalia', 'Eritrea', 'Cuba',
  'Nicaragua', 'Haiti', 'Bolivia', 'Argentina', 'Brazil', 'Mexico',
  'South_Africa', 'Egypt', 'Qatar', 'United_Arab_Emirates', 'Kazakhstan',

  // ---- Armed groups and non-state actors ----
  'Hamas', 'Hezbollah', 'Houthi_movement', 'Wagner_Group',
  'Islamic_State', 'Taliban', 'Al-Qaeda', 'Boko_Haram',
  'Kurdistan_Workers%27_Party', 'Islamic_Revolutionary_Guard_Corps',

  // ---- Economic and energy machinery ----
  'Nord_Stream', 'Nord_Stream_pipeline_sabotage', 'OPEC%2B',
  'Semiconductor_industry', 'TSMC', 'ASML_Holding', 'Rare_earth_element',
  'Lithium', 'Cobalt', 'Liquefied_natural_gas', 'Petrodollar',
  'SWIFT', 'Economic_sanctions', 'Tariff', 'Supply_chain',
  'Strategic_Petroleum_Reserve', 'Inflation', 'Recession',
  'Sovereign_default', 'Central_bank_digital_currency',

  // ---- Nuclear and strategic ----
  'Nuclear_weapon', 'Treaty_on_the_Non-Proliferation_of_Nuclear_Weapons',
  'Intercontinental_ballistic_missile', 'Doomsday_Clock',
  'Nuclear_sharing', 'Iran_and_weapons_of_mass_destruction',
  'North_Korea_and_weapons_of_mass_destruction',

  // ---- Systemic risks ----
  'Climate_change', 'Food_security', 'Refugee_crisis', 'Cyberwarfare',
  'Disinformation', 'Artificial_intelligence_arms_race', 'Pandemic',
  'Water_scarcity', 'Desertification', 'Sea_level_rise',

  // ---- Concepts that spike when something breaks ----
  'Coup_d%27état', 'Martial_law', 'State_of_emergency', 'Impeachment',
  'Referendum', 'Ceasefire', 'Blockade', 'No-fly_zone',
  'Article_5_of_the_North_Atlantic_Treaty', 'Casus_belli',
  'Mutual_assured_destruction', 'Proxy_war', 'Hybrid_warfare',
]
