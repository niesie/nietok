/**
 * The economic series the feed tracks.
 *
 * `transform: 'yoy_pct'` matters for index series — nobody wants "CPI is
 * 320.4", they want "inflation is 3.1%". `notableOnly` series emit a card only
 * when something actually moved, so markets don't fill the feed with noise on
 * a flat day.
 */
export const SERIES = [
  // ---- Inflation & rates ----
  { id: 'CPIAUCSL', label: 'US inflation', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'CP0000EZ19M086NEST', label: 'Euro area inflation', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'FEDFUNDS', label: 'US federal funds rate', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'ECBDFR', label: 'ECB deposit rate', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'DGS10', label: 'US 10-year Treasury yield', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'T10Y2Y', label: 'US yield curve (10y minus 2y)', format: 'percentPlain', type: 'econ', topics: ['economy', 'americas'] },

  // ---- Real economy ----
  { id: 'UNRATE', label: 'US unemployment', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'LRHUTTTTEZM156S', label: 'Euro area unemployment', format: 'percent', type: 'econ', topics: ['economy', 'eu'] },
  { id: 'GDPC1', label: 'US real GDP', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },
  { id: 'INDPRO', label: 'US industrial production', transform: 'yoy_pct', format: 'percent', type: 'econ', topics: ['economy', 'americas'] },

  // ---- Energy: the most geopolitical numbers here ----
  { id: 'DCOILBRENTEU', label: 'Brent crude', format: 'usd', unit: '/bbl', type: 'econ', topics: ['energy'] },
  { id: 'DHHNGSP', label: 'US natural gas (Henry Hub)', format: 'usd', unit: '/MMBtu', type: 'econ', topics: ['energy', 'americas'] },
  { id: 'PNGASEUUSDM', label: 'European natural gas', format: 'usd', unit: '/MMBtu', type: 'econ', topics: ['energy', 'eu'] },

  // ---- Trade ----
  { id: 'BOPGSTB', label: 'US trade balance', format: 'usdBillions', type: 'trade', topics: ['trade', 'americas'] },
  { id: 'IMPCH', label: 'US imports from China', format: 'usdMillions', type: 'trade', topics: ['trade', 'china'] },

  // ---- Markets: only when something moved ----
  { id: 'SP500', label: 'S&P 500', format: 'number', type: 'markets', notableOnly: true, topics: ['economy'] },
  { id: 'VIXCLS', label: 'VIX volatility index', format: 'number', type: 'markets', notableOnly: true, topics: ['economy'] },
  { id: 'DEXUSEU', label: 'US dollar per euro', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'eu'] },
  { id: 'DEXCHUS', label: 'Chinese yuan per dollar', format: 'number', type: 'markets', notableOnly: true, topics: ['economy', 'china'] },
]
