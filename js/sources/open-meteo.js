/**
 * Open-Meteo Weather Data Source
 * https://open-meteo.com/ — Free, no API key required, global coverage
 * Supports: current weather, 16-day daily forecast, seasonal forecast (30-day)
 */
var OpenMeteoSource = (function () {
  var name = 'Open-Meteo';
  var attribution = 'Open-Meteo.com';

  var WMO_CODES = {
    0: { desc: 'Clear sky', icon: '\u2600\uFE0F' },
    1: { desc: 'Mainly clear', icon: '\uD83C\uDF24\uFE0F' },
    2: { desc: 'Partly cloudy', icon: '\u26C5' },
    3: { desc: 'Overcast', icon: '\u2601\uFE0F' },
    45: { desc: 'Fog', icon: '\uD83C\uDF2B\uFE0F' },
    48: { desc: 'Depositing rime fog', icon: '\uD83C\uDF2B\uFE0F' },
    51: { desc: 'Light drizzle', icon: '\uD83C\uDF26\uFE0F' },
    53: { desc: 'Moderate drizzle', icon: '\uD83C\uDF26\uFE0F' },
    55: { desc: 'Dense drizzle', icon: '\uD83C\uDF27\uFE0F' },
    56: { desc: 'Light freezing drizzle', icon: '\uD83C\uDF27\uFE0F' },
    57: { desc: 'Dense freezing drizzle', icon: '\uD83C\uDF27\uFE0F' },
    61: { desc: 'Slight rain', icon: '\uD83C\uDF26\uFE0F' },
    63: { desc: 'Moderate rain', icon: '\uD83C\uDF27\uFE0F' },
    65: { desc: 'Heavy rain', icon: '\uD83C\uDF27\uFE0F' },
    66: { desc: 'Light freezing rain', icon: '\uD83C\uDF27\uFE0F' },
    67: { desc: 'Heavy freezing rain', icon: '\uD83C\uDF27\uFE0F' },
    71: { desc: 'Slight snowfall', icon: '\uD83C\uDF28\uFE0F' },
    73: { desc: 'Moderate snowfall', icon: '\uD83C\uDF28\uFE0F' },
    75: { desc: 'Heavy snowfall', icon: '\u2744\uFE0F' },
    77: { desc: 'Snow grains', icon: '\u2744\uFE0F' },
    80: { desc: 'Slight rain showers', icon: '\uD83C\uDF26\uFE0F' },
    81: { desc: 'Moderate rain showers', icon: '\uD83C\uDF27\uFE0F' },
    82: { desc: 'Violent rain showers', icon: '\uD83C\uDF27\uFE0F' },
    85: { desc: 'Slight snow showers', icon: '\uD83C\uDF28\uFE0F' },
    86: { desc: 'Heavy snow showers', icon: '\u2744\uFE0F' },
    95: { desc: 'Thunderstorm', icon: '\u26C8\uFE0F' },
    96: { desc: 'Thunderstorm with slight hail', icon: '\u26C8\uFE0F' },
    99: { desc: 'Thunderstorm with heavy hail', icon: '\u26C8\uFE0F' }
  };

  function decodeWMO(code) {
    return WMO_CODES[code] || { desc: 'Unknown', icon: '\u2753' };
  }

  function formatTime(iso) {
    if (!iso) return '--';
    var d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fetchCurrent(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
      '&daily=sunrise,sunset,uv_index_max' +
      '&timezone=auto&forecast_days=1';

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.reason || 'Open-Meteo API error');
        var c = data.current;
        var wmo = decodeWMO(c.weather_code);
        var daily = data.daily || {};
        return {
          temp: Math.round(c.temperature_2m),
          feelsLike: Math.round(c.apparent_temperature),
          humidity: c.relative_humidity_2m,
          windSpeed: Math.round(c.wind_speed_10m),
          windDir: c.wind_direction_10m,
          pressure: Math.round(c.surface_pressure),
          uv: daily.uv_index_max ? daily.uv_index_max[0] : null,
          visibility: null,
          description: wmo.desc,
          icon: wmo.icon,
          sunrise: formatTime(daily.sunrise ? daily.sunrise[0] : null),
          sunset: formatTime(daily.sunset ? daily.sunset[0] : null),
          unit: '\u00B0C'
        };
      });
  }

  function fetchFiveDay(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
      '&timezone=auto&forecast_days=5';

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.reason || 'Open-Meteo API error');
        var d = data.daily;
        var days = [];
        for (var i = 0; i < d.time.length; i++) {
          var wmo = decodeWMO(d.weather_code[i]);
          days.push({
            date: d.time[i],
            high: Math.round(d.temperature_2m_max[i]),
            low: Math.round(d.temperature_2m_min[i]),
            description: wmo.desc,
            icon: wmo.icon,
            precipChance: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
            precipAmount: d.precipitation_sum ? d.precipitation_sum[i] : null,
            unit: '\u00B0C'
          });
        }
        return days;
      });
  }

  function fetchThirtyDay(lat, lon) {
    // Open-Meteo supports up to 16 days via the standard forecast API.
    // For 30 days we combine 16-day forecast + climate averages for remaining days.
    var forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
      '&timezone=auto&forecast_days=16';

    return fetch(forecastUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.reason || 'Open-Meteo API error');
        var d = data.daily;
        var days = [];
        for (var i = 0; i < d.time.length; i++) {
          var wmo = decodeWMO(d.weather_code[i]);
          days.push({
            date: d.time[i],
            high: Math.round(d.temperature_2m_max[i]),
            low: Math.round(d.temperature_2m_min[i]),
            description: wmo.desc,
            icon: wmo.icon,
            precipChance: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
            precipAmount: d.precipitation_sum ? d.precipitation_sum[i] : null,
            unit: '\u00B0C',
            isEstimate: false
          });
        }

        // For days 17-30, fetch climate normals from the previous year
        var remaining = 30 - days.length;
        if (remaining <= 0) return days;

        var lastDate = new Date(d.time[d.time.length - 1]);
        var startDate = new Date(lastDate);
        startDate.setDate(startDate.getDate() + 1);
        var endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + remaining - 1);

        // Use last year's dates for historical data
        var histStart = new Date(startDate);
        histStart.setFullYear(histStart.getFullYear() - 1);
        var histEnd = new Date(endDate);
        histEnd.setFullYear(histEnd.getFullYear() - 1);

        var climateUrl = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat +
          '&longitude=' + lon +
          '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
          '&timezone=auto' +
          '&start_date=' + histStart.toISOString().slice(0, 10) +
          '&end_date=' + histEnd.toISOString().slice(0, 10);

        return fetch(climateUrl)
          .then(function (r) { return r.json(); })
          .then(function (climData) {
            if (climData.daily && climData.daily.time) {
              var cd = climData.daily;
              for (var j = 0; j < cd.time.length; j++) {
                var wmo2 = decodeWMO(cd.weather_code[j]);
                // Shift date to current year
                var origDate = new Date(cd.time[j]);
                origDate.setFullYear(origDate.getFullYear() + 1);
                days.push({
                  date: origDate.toISOString().slice(0, 10),
                  high: Math.round(cd.temperature_2m_max[j]),
                  low: Math.round(cd.temperature_2m_min[j]),
                  description: wmo2.desc,
                  icon: wmo2.icon,
                  precipChance: null,
                  precipAmount: cd.precipitation_sum ? cd.precipitation_sum[j] : null,
                  unit: '\u00B0C',
                  isEstimate: true
                });
              }
            }
            return days;
          })
          .catch(function () {
            // If climate data fails, return what we have
            return days;
          });
      });
  }

  function fetchHourly(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation' +
      '&timezone=auto&forecast_days=3';

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.reason || 'Open-Meteo API error');
        var h = data.hourly;
        var hours = [];
        for (var i = 0; i < h.time.length; i++) {
          var wmo = decodeWMO(h.weather_code[i]);
          hours.push({
            time: h.time[i],
            temp: Math.round(h.temperature_2m[i]),
            feelsLike: h.apparent_temperature ? Math.round(h.apparent_temperature[i]) : null,
            humidity: h.relative_humidity_2m ? h.relative_humidity_2m[i] : null,
            description: wmo.desc,
            icon: wmo.icon,
            precipChance: h.precipitation_probability ? h.precipitation_probability[i] : null,
            precipAmount: h.precipitation ? h.precipitation[i] : null,
            windSpeed: h.wind_speed_10m ? Math.round(h.wind_speed_10m[i]) : null,
            windDir: h.wind_direction_10m ? h.wind_direction_10m[i] : null,
            unit: '\u00B0C'
          });
        }
        return hours;
      });
  }

  function getInfoBanner() {
    return 'First 16 days are forecasted. Days 17\u201330 use last year\u2019s historical data as estimates.';
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
