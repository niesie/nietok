/**
 * The economic series the feed tracks. Every id here was probed against the
 * FRED API for existence and recency before being added — several
 * plausible-looking series (the whole CPALTT01 country-CPI family, and euro
 * area unemployment as LRHUTTTTEZM156S) are discontinued and were quietly
 * serving years-old numbers as if they were current.
 *
 * `transform: 'yoy_pct'` matters for index and level series — nobody wants
 * "CPI is 320.4", they want "inflation is 3.1%".
 *
 * `notableOnly` series emit a card only when something actually moved, so a
 * quiet day produces no markets cards rather than fourteen shrugs.
 */
export const SERIES = [
  // ---- US: prices and money ----
  { id: 'CPIAUCSL', peerGroup: 'Consumer price inflation', country: 'United States', label: 'US inflation', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'PCEPILFE', label: 'US core PCE inflation', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'M2SL', label: 'US money supply (M2)', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },

  // ---- US: real economy ----
  { id: 'UNRATE', peerGroup: 'Unemployment rate', country: 'United States', label: 'US unemployment', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'PAYEMS', label: 'US payroll employment', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'CIVPART', label: 'US labour force participation', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'GDPC1', label: 'US real GDP', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'INDPRO', label: 'US industrial production', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'RSAFS', label: 'US retail sales', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'HOUST', label: 'US housing starts', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'UMCSENT', label: 'US consumer sentiment', format: 'index', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'GFDEGDQ188S', label: 'US federal debt to GDP', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },

  // ---- US: rates and credit ----
  { id: 'FEDFUNDS', label: 'US federal funds rate', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'DGS2', label: 'US 2-year Treasury yield', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'DGS10', peerGroup: '10-year government bond yield', country: 'United States', label: 'US 10-year Treasury yield', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'DGS30', label: 'US 30-year Treasury yield', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'T10Y2Y', label: 'US yield curve (10y minus 2y)', format: 'percentPlain', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'T10YIE', label: 'US 10-year inflation expectations', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'BAA10Y', label: 'US corporate bond spread', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'BAMLH0A0HYM2', label: 'US high-yield credit spread', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'MORTGAGE30US', label: 'US 30-year mortgage rate', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },

  // ---- Euro area and Europe ----
  { id: 'CP0000EZ19M086NEST', peerGroup: 'Consumer price inflation', country: 'Euro area', label: 'Euro area inflation', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'ECBDFR', label: 'ECB deposit rate', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'CLVMNACSCAB1GQEA19', label: 'Euro area real GDP', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'IRLTLT01DEM156N', peerGroup: '10-year government bond yield', country: 'Germany', label: 'German 10-year bund yield', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'IRLTLT01FRM156N', peerGroup: '10-year government bond yield', country: 'France', label: 'French 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'IRLTLT01ITM156N', peerGroup: '10-year government bond yield', country: 'Italy', label: 'Italian 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'IRLTLT01ESM156N', peerGroup: '10-year government bond yield', country: 'Spain', label: 'Spanish 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'IRLTLT01GBM156N', peerGroup: '10-year government bond yield', country: 'United Kingdom', label: 'UK 10-year gilt yield', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'LRHUTTTTDEM156S', peerGroup: 'Unemployment rate', country: 'Germany', label: 'German unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'LRHUTTTTFRM156S', peerGroup: 'Unemployment rate', country: 'France', label: 'French unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'LRHUTTTTITM156S', peerGroup: 'Unemployment rate', country: 'Italy', label: 'Italian unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'LRHUTTTTESM156S', peerGroup: 'Unemployment rate', country: 'Spain', label: 'Spanish unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'LRHUTTTTGBM156S', peerGroup: 'Unemployment rate', country: 'United Kingdom', label: 'UK unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },

  // ---- Asia-Pacific and North America ----
  { id: 'IRLTLT01JPM156N', peerGroup: '10-year government bond yield', country: 'Japan', label: 'Japanese 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'asia'] },
  { id: 'IRLTLT01KRM156N', peerGroup: '10-year government bond yield', country: 'South Korea', label: 'South Korean 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'asia'] },
  { id: 'IRLTLT01CAM156N', peerGroup: '10-year government bond yield', country: 'Canada', label: 'Canadian 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'IRLTLT01AUM156N', peerGroup: '10-year government bond yield', country: 'Australia', label: 'Australian 10-year yield', format: 'percent', type: 'econ', topics: ['economy', 'asia'] },
  { id: 'LRHUTTTTJPM156S', peerGroup: 'Unemployment rate', country: 'Japan', label: 'Japanese unemployment', format: 'percent', type: 'econ', topics: ['economy', 'asia'] },
  { id: 'LRHUTTTTCAM156S', peerGroup: 'Unemployment rate', country: 'Canada', label: 'Canadian unemployment', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },

  // ---- Energy: the most geopolitical numbers here ----
  { id: 'DCOILBRENTEU', peerGroup: 'Crude oil benchmark', country: 'Brent (Europe)', label: 'Brent crude', format: 'usd', unit: '/bbl', type: 'econ', topics: ['energy'] },
  { id: 'DCOILWTICO', peerGroup: 'Crude oil benchmark', country: 'WTI (US)', label: 'WTI crude', format: 'usd', unit: '/bbl', type: 'econ', topics: ['energy', 'americas'] },
  { id: 'DHHNGSP', peerGroup: 'Natural gas price by region', country: 'United States', label: 'US natural gas (Henry Hub)', format: 'usd', unit: '/MMBtu', type: 'econ', topics: ['energy', 'americas'] },
  { id: 'PNGASEUUSDM', peerGroup: 'Natural gas price by region', country: 'Europe', label: 'European natural gas', format: 'usd', unit: '/MMBtu', type: 'econ', topics: ['energy', 'eu'] },
  { id: 'PNGASJPUSDM', peerGroup: 'Natural gas price by region', country: 'Asia (LNG)', label: 'Asian LNG', format: 'usd', unit: '/MMBtu', type: 'econ', topics: ['energy', 'asia'] },
  { id: 'PCOALAUUSDM', label: 'Australian coal', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['energy', 'asia'] },
  { id: 'PNRGINDEXM', label: 'Global energy price index', format: 'index', type: 'econ', topics: ['energy'] },

  // ---- Commodities: food and metals drive a lot of unrest ----
  { id: 'PCOPPUSDM', label: 'Copper', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PALUMUSDM', label: 'Aluminium', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PIORECRUSDM', label: 'Iron ore', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PWHEAMTUSDM', label: 'Wheat', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PMAIZMTUSDM', label: 'Corn', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PSOYBUSDM', label: 'Soybeans', format: 'usdWhole', unit: '/t', type: 'econ', topics: ['trade'] },
  { id: 'PSUGAISAUSDM', label: 'Sugar', format: 'usd', unit: '/kg', type: 'econ', topics: ['trade'] },
  { id: 'PCOFFOTMUSDM', label: 'Coffee', format: 'usd', unit: '/kg', type: 'econ', topics: ['trade'] },
  { id: 'PCOTTINDUSDM', label: 'Cotton', format: 'usd', unit: '/kg', type: 'econ', topics: ['trade'] },
  { id: 'PALLFNFINDEXM', label: 'Global commodity price index', format: 'index', type: 'econ', topics: ['trade'] },

  // ---- Trade flows ----
  { id: 'BOPGSTB', label: 'US trade balance', format: 'usdBillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'NETEXP', label: 'US net exports', format: 'usdBillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'IMPCH', peerGroup: 'US goods imports by partner', country: 'China', label: 'US imports from China', format: 'usdMillions', type: 'trade', topics: ['trade', 'china'] },
  { id: 'EXPCH', peerGroup: 'US goods exports by partner', country: 'China', label: 'US exports to China', format: 'usdMillions', type: 'trade', topics: ['trade', 'china'] },
  { id: 'IMPMX', peerGroup: 'US goods imports by partner', country: 'Mexico', label: 'US imports from Mexico', format: 'usdMillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'EXPMX', peerGroup: 'US goods exports by partner', country: 'Mexico', label: 'US exports to Mexico', format: 'usdMillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'IMPCA', peerGroup: 'US goods imports by partner', country: 'Canada', label: 'US imports from Canada', format: 'usdMillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'EXPCA', peerGroup: 'US goods exports by partner', country: 'Canada', label: 'US exports to Canada', format: 'usdMillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'IMPJP', peerGroup: 'US goods imports by partner', country: 'Japan', label: 'US imports from Japan', format: 'usdMillions', type: 'trade', topics: ['trade', 'asia'] },
  { id: 'EXPJP', peerGroup: 'US goods exports by partner', country: 'Japan', label: 'US exports to Japan', format: 'usdMillions', type: 'trade', topics: ['trade', 'asia'] },
  { id: 'IMPGE', peerGroup: 'US goods imports by partner', country: 'Germany', label: 'US imports from Germany', format: 'usdMillions', type: 'trade', topics: ['trade', 'eu'] },
  { id: 'EXPGE', peerGroup: 'US goods exports by partner', country: 'Germany', label: 'US exports to Germany', format: 'usdMillions', type: 'trade', topics: ['trade', 'eu'] },

  // ---- Uncertainty indices ----
  { id: 'GEPUCURRENT', label: 'Global economic policy uncertainty', format: 'index', type: 'econ', topics: ['economy'] },
  { id: 'USEPUINDXD', label: 'US economic policy uncertainty', format: 'index', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'WLEMUINDXD', label: 'Equity market uncertainty', format: 'index', type: 'markets', notableOnly: true, topics: ['economy'] },

  // ---- Markets: only when something moved ----
  { id: 'SP500', label: 'S&P 500', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'NASDAQCOM', label: 'NASDAQ Composite', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'DJIA', label: 'Dow Jones Industrial Average', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'VIXCLS', label: 'VIX volatility index', format: 'number', type: 'markets', notableOnly: true, topics: ['economy'] },

  // ---- FX: also only when something moved ----
  { id: 'DEXUSEU', label: 'US dollar per euro', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'eu'] },
  { id: 'DEXCHUS', label: 'Chinese yuan per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'china'] },
  { id: 'DEXJPUS', label: 'Japanese yen per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'asia'] },
  { id: 'DEXUSUK', label: 'US dollar per pound', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'eu'] },
  { id: 'DEXINUS', label: 'Indian rupee per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'asia'] },
  { id: 'DEXBZUS', label: 'Brazilian real per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'DEXMXUS', label: 'Mexican peso per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'DEXSFUS', label: 'South African rand per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'africa'] },
  { id: 'DEXKOUS', label: 'South Korean won per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'asia'] },
  { id: 'DEXCAUS', label: 'Canadian dollar per US dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'americas'] },
  { id: 'DEXSZUS', label: 'Swiss franc per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'eu'] },
  { id: 'DEXUSAL', label: 'US dollar per Australian dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'asia'] },
]
