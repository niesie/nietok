/**
 * Historical figures worth a card.
 *
 * Curated rather than derived. An algorithmic definition of "forgotten" —
 * well-documented but unread — surfaces people who are genuinely obscure,
 * which is not the same as interesting. The bar here is a story worth telling:
 * mostly people you would half-recognise, plus some you would not where what
 * they did earns the screen.
 *
 * Deliberately spread across regions and centuries, because a list assembled
 * without that constraint drifts to nineteenth-century European men.
 */
export const FIGURES = [
  // ---- Refused to end the world ----
  { title: 'Vasily_Arkhipov', era: '1926–1998' },
  { title: 'Stanislav_Petrov', era: '1939–2017' },

  // ---- Saved people at their own cost ----
  { title: 'Chiune_Sugihara', era: '1900–1986' },
  { title: 'Witold_Pilecki', era: '1901–1948' },
  { title: 'Irena_Sendler', era: '1910–2008' },
  { title: 'Raoul_Wallenberg', era: '1912–1945?' },
  { title: 'Nicholas_Winton', era: '1909–2015' },
  { title: 'Sophie_Scholl', era: '1921–1943' },
  { title: 'Nancy_Wake', era: '1912–2011' },
  { title: 'Virginia_Hall', era: '1906–1982' },
  { title: 'Juan_Pujol_García', era: '1912–1988' },

  // ---- Fed and poisoned the world ----
  { title: 'Fritz_Haber', era: '1868–1934' },
  { title: 'Norman_Borlaug', era: '1914–2009' },
  { title: 'Thomas_Midgley_Jr.', era: '1889–1944' },
  { title: 'Clair_Cameron_Patterson', era: '1922–1995' },
  { title: 'Rachel_Carson', era: '1907–1964' },
  { title: 'Wangari_Maathai', era: '1940–2011' },

  // ---- Medicine, and the price of being right early ----
  { title: 'Ignaz_Semmelweis', era: '1818–1865' },
  { title: 'John_Snow', era: '1813–1858' },
  { title: 'Florence_Nightingale', era: '1820–1910' },
  { title: 'Mary_Seacole', era: '1805–1881' },
  { title: 'Edward_Jenner', era: '1749–1823' },
  { title: 'Onesimus_(Boston)', era: 'c. 1700s' },
  { title: 'Louis_Pasteur', era: '1822–1895' },
  { title: 'Alexander_Fleming', era: '1881–1955' },
  { title: 'Howard_Florey', era: '1898–1968' },
  { title: 'Maurice_Hilleman', era: '1919–2005' },
  { title: 'Jonas_Salk', era: '1914–1995' },
  { title: 'Alice_Ball', era: '1892–1916' },
  { title: 'Henrietta_Lacks', era: '1920–1951' },
  { title: 'Percy_Lavon_Julian', era: '1899–1975' },

  // ---- Looked at the sky ----
  { title: 'Hypatia', era: 'c. 350–415' },
  { title: 'Caroline_Herschel', era: '1750–1848' },
  { title: 'Williamina_Fleming', era: '1857–1911' },
  { title: 'Annie_Jump_Cannon', era: '1863–1941' },
  { title: 'Henrietta_Swan_Leavitt', era: '1868–1921' },
  { title: 'Cecilia_Payne-Gaposchkin', era: '1900–1979' },
  { title: 'Zhang_Heng', era: '78–139' },
  { title: 'Ulugh_Beg', era: '1394–1449' },
  { title: 'Aryabhata', era: 'c. 476–550' },

  // ---- Mathematics and machines ----
  { title: 'Ada_Lovelace', era: '1815–1852' },
  { title: 'Alan_Turing', era: '1912–1954' },
  { title: 'Emmy_Noether', era: '1882–1935' },
  { title: 'Sophie_Germain', era: '1776–1831' },
  { title: 'Émilie_du_Châtelet', era: '1706–1749' },
  { title: 'Muhammad_ibn_Musa_al-Khwarizmi', era: 'c. 780–850' },
  { title: 'Grace_Hopper', era: '1906–1992' },
  { title: 'Katherine_Johnson', era: '1918–2020' },
  { title: 'Margaret_Hamilton_(software_engineer)', era: 'b. 1936' },
  { title: 'Claude_Shannon', era: '1916–2001' },
  { title: 'John_von_Neumann', era: '1903–1957' },
  { title: 'Hedy_Lamarr', era: '1914–2000' },
  { title: 'Nikola_Tesla', era: '1856–1943' },
  { title: 'Michael_Faraday', era: '1791–1867' },

  // ---- Physics and the bomb ----
  { title: 'Marie_Curie', era: '1867–1934' },
  { title: 'Lise_Meitner', era: '1878–1968' },
  { title: 'Chien-Shiung_Wu', era: '1912–1997' },
  { title: 'Rosalind_Franklin', era: '1920–1958' },
  { title: 'Sergei_Korolev', era: '1907–1966' },
  { title: 'Yuri_Gagarin', era: '1934–1968' },
  { title: 'Valentina_Tereshkova', era: 'b. 1937' },

  // ---- Scholars of the Islamic world ----
  { title: 'Ibn_al-Haytham', era: 'c. 965–1040' },
  { title: 'Avicenna', era: 'c. 980–1037' },
  { title: 'Ibn_Khaldun', era: '1332–1406' },
  { title: 'Al-Biruni', era: '973–1050' },
  { title: 'Fatima_al-Fihri', era: 'd. 880' },

  // ---- Went a very long way ----
  { title: 'Ibn_Battuta', era: '1304–1369' },
  { title: 'Zheng_He', era: '1371–1433' },
  { title: 'Jeanne_Baret', era: '1740–1807' },
  { title: 'Nellie_Bly', era: '1864–1922' },
  { title: 'Matthew_Henson', era: '1866–1955' },
  { title: 'Ernest_Shackleton', era: '1874–1922' },
  { title: 'Xuanzang', era: 'c. 602–664' },

  // ---- Rulers who changed the shape of things ----
  { title: 'Hatshepsut', era: 'c. 1507–1458 BC' },
  { title: 'Cyrus_the_Great', era: 'c. 600–530 BC' },
  { title: 'Ashoka', era: 'c. 304–232 BC' },
  { title: 'Wu_Zetian', era: '624–705' },
  { title: 'Mansa_Musa', era: 'c. 1280–1337' },
  { title: 'Sejong_the_Great', era: '1397–1450' },
  { title: 'Suleiman_the_Magnificent', era: '1494–1566' },
  { title: 'Akbar', era: '1542–1605' },
  { title: 'Nzinga_of_Ndongo_and_Matamba', era: 'c. 1583–1663' },
  { title: 'Menelik_II', era: '1844–1913' },
  { title: 'Taytu_Betul', era: 'c. 1851–1918' },
  { title: 'Yaa_Asantewaa', era: 'c. 1840–1921' },
  { title: 'Genghis_Khan', era: 'c. 1162–1227' },
  { title: 'Timur', era: '1336–1405' },

  // ---- Ended empires, or tried ----
  { title: 'Toussaint_Louverture', era: '1743–1803' },
  { title: 'Simón_Bolívar', era: '1783–1830' },
  { title: 'José_Rizal', era: '1861–1896' },
  { title: 'Patrice_Lumumba', era: '1925–1961' },
  { title: 'Thomas_Sankara', era: '1949–1987' },
  { title: 'Kwame_Nkrumah', era: '1909–1972' },
  { title: 'Amílcar_Cabral', era: '1924–1973' },
  { title: 'Ho_Chi_Minh', era: '1890–1969' },
  { title: 'Lakshmibai', era: '1828–1858' },
  { title: 'Túpac_Amaru_II', era: '1738–1781' },

  // ---- Refused to accept the terms offered ----
  { title: 'Harriet_Tubman', era: 'c. 1822–1913' },
  { title: 'Frederick_Douglass', era: '1818–1895' },
  { title: 'Olaudah_Equiano', era: 'c. 1745–1797' },
  { title: 'Ida_B._Wells', era: '1862–1931' },
  { title: 'Bayard_Rustin', era: '1912–1987' },
  { title: 'Claudette_Colvin', era: 'b. 1939' },
  { title: 'Emmeline_Pankhurst', era: '1858–1928' },
  { title: 'Sojourner_Truth', era: 'c. 1797–1883' },

  // ---- One decision, enormous consequences ----
  { title: 'Gavrilo_Princip', era: '1894–1918' },
  { title: 'Mata_Hari', era: '1876–1917' },
  { title: 'Roger_Casement', era: '1864–1916' },
  { title: 'Deng_Xiaoping', era: '1904–1997' },
  { title: 'Mary_Anning', era: '1799–1847' },
  { title: 'George_Washington_Carver', era: 'c. 1864–1943' },
  { title: 'Benjamin_Banneker', era: '1731–1806' },
]
