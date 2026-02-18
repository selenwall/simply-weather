/**
 * SMHI (Swedish Meteorological and Hydrological Institute) Weather Data Source
 * https://opendata.smhi.se/ — Free, no API key required
 * Coverage: Scandinavia / Northern Europe (approx lat 52-72, lon 2-32)
 * Supports: current weather, ~10-day forecast
 */
var SMHISource = (function () {
  var name = 'SMHI';
  var attribution = 'SMHI (Swedish Meteorological and Hydrological Institute)';
  var API_URL = 'https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point';

  // SMHI weather symbol codes (Wsymb2) mapped to descriptions and emoji
  var SYMBOL_MAP = {
    1: { desc: 'Clear sky', icon: '\u2600\uFE0F' },
    2: { desc: 'Nearly clear sky', icon: '\uD83C\uDF24\uFE0F' },
    3: { desc: 'Variable cloudiness', icon: '\u26C5' },
    4: { desc: 'Halfclear sky', icon: '\u26C5' },
    5: { desc: 'Cloudy sky', icon: '\u2601\uFE0F' },
    6: { desc: 'Overcast', icon: '\u2601\uFE0F' },
    7: { desc: 'Fog', icon: '\uD83C\uDF2B\uFE0F' },
    8: { desc: 'Light rain showers', icon: '\uD83C\uDF26\uFE0F' },
    9: { desc: 'Moderate rain showers', icon: '\uD83C\uDF27\uFE0F' },
    10: { desc: 'Heavy rain showers', icon: '\uD83C\uDF27\uFE0F' },
    11: { desc: 'Thunderstorm', icon: '\u26C8\uFE0F' },
    12: { desc: 'Light sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    13: { desc: 'Moderate sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    14: { desc: 'Heavy sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    15: { desc: 'Light snow showers', icon: '\uD83C\uDF28\uFE0F' },
    16: { desc: 'Moderate snow showers', icon: '\uD83C\uDF28\uFE0F' },
    17: { desc: 'Heavy snow showers', icon: '\u2744\uFE0F' },
    18: { desc: 'Light rain', icon: '\uD83C\uDF26\uFE0F' },
    19: { desc: 'Moderate rain', icon: '\uD83C\uDF27\uFE0F' },
    20: { desc: 'Heavy rain', icon: '\uD83C\uDF27\uFE0F' },
    21: { desc: 'Thunder', icon: '\u26C8\uFE0F' },
    22: { desc: 'Light sleet', icon: '\uD83C\uDF27\uFE0F' },
    23: { desc: 'Moderate sleet', icon: '\uD83C\uDF27\uFE0F' },
    24: { desc: 'Heavy sleet', icon: '\uD83C\uDF27\uFE0F' },
    25: { desc: 'Light snowfall', icon: '\uD83C\uDF28\uFE0F' },
    26: { desc: 'Moderate snowfall', icon: '\uD83C\uDF28\uFE0F' },
    27: { desc: 'Heavy snowfall', icon: '\u2744\uFE0F' }
  };

  function decodeSymbol(code) {
    return SYMBOL_MAP[code] || { desc: 'Unknown', icon: '\u2753' };
  }

  function getParam(params, name) {
    for (var i = 0; i < params.length; i++) {
      if (params[i].name === name) return params[i].values[0];
    }
    return null;
  }

  function fetchData(lat, lon) {
    // SMHI requires coordinates rounded to 6 decimals
    var url = API_URL + '/lon/' + lon.toFixed(6) + '/lat/' + lat.toFixed(6) + '/data.json';
    return fetch(url).then(function (r) {
      if (r.status === 404 || r.status === 400) {
        throw new Error('SMHI does not cover this location. Coverage is limited to Scandinavia and Northern Europe.');
      }
      if (!r.ok) throw new Error('SMHI API error: ' + r.status);
      return r.json();
    });
  }

  function fetchCurrent(lat, lon) {
    return fetchData(lat, lon).then(function (data) {
      var ts = data.timeSeries;
      if (!ts || ts.length === 0) throw new Error('No data available from SMHI');

      var now = ts[0];
      var params = now.parameters;
      var temp = getParam(params, 't');
      var ws = getParam(params, 'ws');
      var wd = getParam(params, 'wd');
      var rh = getParam(params, 'r');
      var msl = getParam(params, 'msl');
      var wsymb = getParam(params, 'Wsymb2');
      var gust = getParam(params, 'gust');
      var decoded = decodeSymbol(wsymb);

      return {
        temp: temp != null ? Math.round(temp) : null,
        feelsLike: null,
        humidity: rh != null ? Math.round(rh) : null,
        windSpeed: ws != null ? Math.round(ws * 3.6) : null, // m/s to km/h
        windDir: wd != null ? Math.round(wd) : null,
        pressure: msl != null ? Math.round(msl) : null,
        uv: null,
        visibility: null,
        description: decoded.desc,
        icon: decoded.icon,
        sunrise: '--',
        sunset: '--',
        unit: '\u00B0C'
      };
    });
  }

  function fetchFiveDay(lat, lon) {
    return fetchData(lat, lon).then(function (data) {
      return aggregateDays(data.timeSeries, 5);
    });
  }

  function fetchThirtyDay(lat, lon) {
    return fetchData(lat, lon).then(function (data) {
      return aggregateDays(data.timeSeries, 30);
    });
  }

  function aggregateDays(timeSeries, maxDays) {
    var dayMap = {};
    var dayOrder = [];

    timeSeries.forEach(function (entry) {
      var dateStr = entry.validTime.slice(0, 10);
      var params = entry.parameters;
      var temp = getParam(params, 't');
      var precip = getParam(params, 'pmean');
      var wsymb = getParam(params, 'Wsymb2');

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = {
          temps: [],
          precip: 0,
          symbols: [],
          date: dateStr
        };
        dayOrder.push(dateStr);
      }
      if (temp != null) dayMap[dateStr].temps.push(temp);
      if (precip != null) dayMap[dateStr].precip += precip;
      if (wsymb != null) dayMap[dateStr].symbols.push(wsymb);
    });

    var days = [];
    var count = Math.min(dayOrder.length, maxDays);
    for (var i = 0; i < count; i++) {
      var key = dayOrder[i];
      var d = dayMap[key];
      if (d.temps.length === 0) continue;
      var high = Math.round(Math.max.apply(null, d.temps));
      var low = Math.round(Math.min.apply(null, d.temps));
      var midSymbol = d.symbols.length > 0 ? d.symbols[Math.floor(d.symbols.length / 2)] : null;
      var decoded = decodeSymbol(midSymbol);

      days.push({
        date: d.date,
        high: high,
        low: low,
        description: decoded.desc,
        icon: decoded.icon,
        precipChance: null,
        precipAmount: Math.round(d.precip * 10) / 10,
        unit: '\u00B0C',
        isEstimate: false
      });
    }
    return days;
  }

  function fetchHourly(lat, lon) {
    return fetchData(lat, lon).then(function (data) {
      var ts = data.timeSeries;
      var hours = [];
      var now = new Date();
      var cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() + 3);

      ts.forEach(function (entry) {
        var entryTime = new Date(entry.validTime);
        if (entryTime > cutoff) return;

        var params = entry.parameters;
        var temp = getParam(params, 't');
        var ws = getParam(params, 'ws');
        var wd = getParam(params, 'wd');
        var rh = getParam(params, 'r');
        var wsymb = getParam(params, 'Wsymb2');
        var pmean = getParam(params, 'pmean');
        var decoded = decodeSymbol(wsymb);

        hours.push({
          time: entry.validTime.slice(0, 16),
          temp: temp != null ? Math.round(temp) : null,
          feelsLike: null,
          humidity: rh != null ? Math.round(rh) : null,
          description: decoded.desc,
          icon: decoded.icon,
          precipChance: null,
          precipAmount: pmean,
          windSpeed: ws != null ? Math.round(ws * 3.6) : null,
          windDir: wd != null ? Math.round(wd) : null,
          unit: '\u00B0C'
        });
      });
      return hours;
    });
  }

  function getInfoBanner() {
    return 'SMHI provides approximately 10 days of forecast data. Coverage is limited to Scandinavia and Northern Europe.';
  }

  return {
    name: name,
    attribution: attribution,
    fetchCurrent: fetchCurrent,
    fetchFiveDay: fetchFiveDay,
    fetchThirtyDay: fetchThirtyDay,
    fetchHourly: fetchHourly,
    getInfoBanner: getInfoBanner
  };
})();
