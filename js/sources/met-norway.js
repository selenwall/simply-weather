/**
 * MET Norway (Yr) Weather Data Source
 * https://api.met.no/ — Free, no API key required, global coverage
 * Requires User-Agent header per terms of service.
 * Supports: current weather, ~10-day forecast
 */
var MetNorwaySource = (function () {
  var name = 'MET Norway';
  var attribution = 'MET Norway / Yr.no';
  var API_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

  // MET Norway uses symbol codes for weather — map to emoji + description
  var SYMBOL_MAP = {
    clearsky: { desc: 'Clear sky', icon: '\u2600\uFE0F' },
    fair: { desc: 'Fair', icon: '\uD83C\uDF24\uFE0F' },
    partlycloudy: { desc: 'Partly cloudy', icon: '\u26C5' },
    cloudy: { desc: 'Cloudy', icon: '\u2601\uFE0F' },
    fog: { desc: 'Fog', icon: '\uD83C\uDF2B\uFE0F' },
    lightrainshowers: { desc: 'Light rain showers', icon: '\uD83C\uDF26\uFE0F' },
    rainshowers: { desc: 'Rain showers', icon: '\uD83C\uDF27\uFE0F' },
    heavyrainshowers: { desc: 'Heavy rain showers', icon: '\uD83C\uDF27\uFE0F' },
    lightrainshowersandthunder: { desc: 'Light rain & thunder', icon: '\u26C8\uFE0F' },
    rainshowersandthunder: { desc: 'Rain & thunder', icon: '\u26C8\uFE0F' },
    heavyrainshowersandthunder: { desc: 'Heavy rain & thunder', icon: '\u26C8\uFE0F' },
    lightsleetshowers: { desc: 'Light sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    sleetshowers: { desc: 'Sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    heavysleetshowers: { desc: 'Heavy sleet showers', icon: '\uD83C\uDF27\uFE0F' },
    lightsnowshowers: { desc: 'Light snow showers', icon: '\uD83C\uDF28\uFE0F' },
    snowshowers: { desc: 'Snow showers', icon: '\uD83C\uDF28\uFE0F' },
    heavysnowshowers: { desc: 'Heavy snow', icon: '\u2744\uFE0F' },
    lightrain: { desc: 'Light rain', icon: '\uD83C\uDF26\uFE0F' },
    rain: { desc: 'Rain', icon: '\uD83C\uDF27\uFE0F' },
    heavyrain: { desc: 'Heavy rain', icon: '\uD83C\uDF27\uFE0F' },
    lightrainandthunder: { desc: 'Light rain & thunder', icon: '\u26C8\uFE0F' },
    rainandthunder: { desc: 'Rain & thunder', icon: '\u26C8\uFE0F' },
    heavyrainandthunder: { desc: 'Heavy rain & thunder', icon: '\u26C8\uFE0F' },
    lightsleet: { desc: 'Light sleet', icon: '\uD83C\uDF27\uFE0F' },
    sleet: { desc: 'Sleet', icon: '\uD83C\uDF27\uFE0F' },
    heavysleet: { desc: 'Heavy sleet', icon: '\uD83C\uDF27\uFE0F' },
    lightsnow: { desc: 'Light snow', icon: '\uD83C\uDF28\uFE0F' },
    snow: { desc: 'Snow', icon: '\uD83C\uDF28\uFE0F' },
    heavysnow: { desc: 'Heavy snow', icon: '\u2744\uFE0F' },
    snowandthunder: { desc: 'Snow & thunder', icon: '\u26C8\uFE0F' },
    sleetandthunder: { desc: 'Sleet & thunder', icon: '\u26C8\uFE0F' },
    sleetshowersandthunder: { desc: 'Sleet showers & thunder', icon: '\u26C8\uFE0F' },
    snowshowersandthunder: { desc: 'Snow showers & thunder', icon: '\u26C8\uFE0F' },
    lightssleetshowersandthunder: { desc: 'Light sleet & thunder', icon: '\u26C8\uFE0F' },
    heavysleetshowersandthunder: { desc: 'Heavy sleet & thunder', icon: '\u26C8\uFE0F' },
    lightsnowshowersandthunder: { desc: 'Light snow & thunder', icon: '\u26C8\uFE0F' },
    heavysnowshowersandthunder: { desc: 'Heavy snow & thunder', icon: '\u26C8\uFE0F' },
    lightssnowshowersandthunder: { desc: 'Light snow & thunder', icon: '\u26C8\uFE0F' },
    heavysnowandthunder: { desc: 'Heavy snow & thunder', icon: '\u26C8\uFE0F' }
  };

  function decodeSymbol(symbolCode) {
    if (!symbolCode) return { desc: 'Unknown', icon: '\u2753' };
    // Remove _day, _night, _polartwilight suffixes
    var base = symbolCode.replace(/_(day|night|polartwilight)$/, '');
    return SYMBOL_MAP[base] || { desc: symbolCode.replace(/_/g, ' '), icon: '\u2601\uFE0F' };
  }

  function fetchData(lat, lon) {
    var url = API_URL + '?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4);
    return fetch(url, {
      headers: { 'User-Agent': 'SimplyWeather/1.0 github.com/simply-weather' }
    }).then(function (r) {
      if (!r.ok) throw new Error('MET Norway API error: ' + r.status);
      return r.json();
    });
  }

  function fetchCurrent(lat, lon) {
    return fetchData(lat, lon).then(function (data) {
      var ts = data.properties.timeseries;
      if (!ts || ts.length === 0) throw new Error('No data available');

      var now = ts[0];
      var instant = now.data.instant.details;
      var next1h = now.data.next_1_hours || now.data.next_6_hours || {};
      var symbol = next1h.summary ? next1h.summary.symbol_code : null;
      var decoded = decodeSymbol(symbol);

      // Find sunrise/sunset — not directly provided by MET Norway compact
      return {
        temp: Math.round(instant.air_temperature),
        feelsLike: null, // Not provided in compact format
        humidity: instant.relative_humidity ? Math.round(instant.relative_humidity) : null,
        windSpeed: instant.wind_speed ? Math.round(instant.wind_speed * 3.6) : null, // m/s to km/h
        windDir: instant.wind_from_direction ? Math.round(instant.wind_from_direction) : null,
        pressure: instant.air_pressure_at_sea_level ? Math.round(instant.air_pressure_at_sea_level) : null,
        uv: instant.ultraviolet_index_clear_sky || null,
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
      var ts = data.properties.timeseries;
      return aggregateDays(ts, 5);
    });
  }

  function fetchThirtyDay(lat, lon) {
    // MET Norway typically provides ~10 days of forecast data
    return fetchData(lat, lon).then(function (data) {
      var ts = data.properties.timeseries;
      return aggregateDays(ts, 30);
    });
  }

  function aggregateDays(timeseries, maxDays) {
    // Group timeseries by date and aggregate min/max temps
    var dayMap = {};
    var dayOrder = [];

    timeseries.forEach(function (entry) {
      var dateStr = entry.time.slice(0, 10);
      var instant = entry.data.instant.details;
      var temp = instant.air_temperature;
      var next = entry.data.next_6_hours || entry.data.next_1_hours || entry.data.next_12_hours;
      var precip = null;
      if (next && next.details) {
        precip = next.details.precipitation_amount || null;
      }
      var symbol = null;
      if (next && next.summary) {
        symbol = next.summary.symbol_code;
      }

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = {
          temps: [],
          precip: 0,
          symbols: [],
          date: dateStr
        };
        dayOrder.push(dateStr);
      }
      dayMap[dateStr].temps.push(temp);
      if (precip) dayMap[dateStr].precip += precip;
      if (symbol) dayMap[dateStr].symbols.push(symbol);
    });

    var days = [];
    var count = Math.min(dayOrder.length, maxDays);
    for (var i = 0; i < count; i++) {
      var key = dayOrder[i];
      var d = dayMap[key];
      var high = Math.round(Math.max.apply(null, d.temps));
      var low = Math.round(Math.min.apply(null, d.temps));
      // Pick the most common midday symbol or first available
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

  function getInfoBanner() {
    return 'MET Norway provides approximately 10 days of forecast data. Days beyond that range are not available from this source.';
  }

  return {
    name: name,
    attribution: attribution,
    fetchCurrent: fetchCurrent,
    fetchFiveDay: fetchFiveDay,
    fetchThirtyDay: fetchThirtyDay,
    getInfoBanner: getInfoBanner
  };
})();
