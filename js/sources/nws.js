/**
 * NWS (National Weather Service) Data Source
 * https://www.weather.gov/documentation/services-web-api — Free, no API key, US only
 * Supports: current observations, 7-day forecast
 */
var NWSSource = (function () {
  var name = 'NWS';
  var attribution = 'National Weather Service (weather.gov)';
  var BASE = 'https://api.weather.gov';
  var HEADERS = {
    'User-Agent': 'SimplyWeather/1.0 (github.com/simply-weather)',
    'Accept': 'application/geo+json'
  };

  var ICON_MAP = {
    skc: { desc: 'Clear', icon: '\u2600\uFE0F' },
    few: { desc: 'Few clouds', icon: '\uD83C\uDF24\uFE0F' },
    sct: { desc: 'Partly cloudy', icon: '\u26C5' },
    bkn: { desc: 'Mostly cloudy', icon: '\uD83C\uDF25\uFE0F' },
    ovc: { desc: 'Overcast', icon: '\u2601\uFE0F' },
    wind_skc: { desc: 'Clear & windy', icon: '\uD83C\uDF2C\uFE0F' },
    wind_few: { desc: 'Few clouds & windy', icon: '\uD83C\uDF2C\uFE0F' },
    wind_sct: { desc: 'Partly cloudy & windy', icon: '\uD83C\uDF2C\uFE0F' },
    wind_bkn: { desc: 'Mostly cloudy & windy', icon: '\uD83C\uDF2C\uFE0F' },
    wind_ovc: { desc: 'Overcast & windy', icon: '\uD83C\uDF2C\uFE0F' },
    snow: { desc: 'Snow', icon: '\uD83C\uDF28\uFE0F' },
    rain_snow: { desc: 'Rain/Snow', icon: '\uD83C\uDF28\uFE0F' },
    rain_sleet: { desc: 'Rain/Sleet', icon: '\uD83C\uDF27\uFE0F' },
    snow_sleet: { desc: 'Snow/Sleet', icon: '\uD83C\uDF28\uFE0F' },
    fzra: { desc: 'Freezing rain', icon: '\uD83C\uDF27\uFE0F' },
    rain_fzra: { desc: 'Rain/Freezing rain', icon: '\uD83C\uDF27\uFE0F' },
    snow_fzra: { desc: 'Snow/Freezing rain', icon: '\uD83C\uDF28\uFE0F' },
    sleet: { desc: 'Sleet', icon: '\uD83C\uDF27\uFE0F' },
    rain: { desc: 'Rain', icon: '\uD83C\uDF27\uFE0F' },
    rain_showers: { desc: 'Rain showers', icon: '\uD83C\uDF26\uFE0F' },
    rain_showers_hi: { desc: 'Rain showers', icon: '\uD83C\uDF26\uFE0F' },
    tsra: { desc: 'Thunderstorm', icon: '\u26C8\uFE0F' },
    tsra_sct: { desc: 'Scattered thunderstorms', icon: '\u26C8\uFE0F' },
    tsra_hi: { desc: 'Thunderstorms', icon: '\u26C8\uFE0F' },
    tornado: { desc: 'Tornado', icon: '\uD83C\uDF2A\uFE0F' },
    hurricane: { desc: 'Hurricane', icon: '\uD83C\uDF00' },
    tropical_storm: { desc: 'Tropical storm', icon: '\uD83C\uDF00' },
    dust: { desc: 'Dust', icon: '\uD83C\uDF2B\uFE0F' },
    smoke: { desc: 'Smoke', icon: '\uD83C\uDF2B\uFE0F' },
    haze: { desc: 'Haze', icon: '\uD83C\uDF2B\uFE0F' },
    hot: { desc: 'Hot', icon: '\uD83C\uDF21\uFE0F' },
    cold: { desc: 'Cold', icon: '\u2744\uFE0F' },
    blizzard: { desc: 'Blizzard', icon: '\uD83C\uDF28\uFE0F' },
    fog: { desc: 'Fog', icon: '\uD83C\uDF2B\uFE0F' }
  };

  function decodeIcon(iconUrl) {
    if (!iconUrl) return { desc: 'Unknown', icon: '\u2753' };
    // NWS icon URLs look like: https://api.weather.gov/icons/land/day/skc?size=medium
    var match = iconUrl.match(/\/icons\/land\/(?:day|night)\/([^?,/]+)/);
    if (match) {
      var code = match[1];
      return ICON_MAP[code] || { desc: code.replace(/_/g, ' '), icon: '\u2601\uFE0F' };
    }
    return { desc: 'Unknown', icon: '\u2601\uFE0F' };
  }

  function fToC(f) {
    return Math.round((f - 32) * 5 / 9);
  }

  function getGridPoint(lat, lon) {
    var url = BASE + '/points/' + lat.toFixed(4) + ',' + lon.toFixed(4);
    return fetch(url, { headers: HEADERS })
      .then(function (r) {
        if (r.status === 404) throw new Error('NWS only covers US locations. Please select a US location or switch data source.');
        if (!r.ok) throw new Error('NWS API error: ' + r.status);
        return r.json();
      });
  }

  function fetchCurrent(lat, lon) {
    return getGridPoint(lat, lon).then(function (point) {
      var stationsUrl = point.properties.observationStations;
      return fetch(stationsUrl, { headers: HEADERS })
        .then(function (r) { return r.json(); })
        .then(function (stations) {
          if (!stations.features || stations.features.length === 0) {
            throw new Error('No observation stations found nearby');
          }
          var stationId = stations.features[0].properties.stationIdentifier;
          return fetch(BASE + '/stations/' + stationId + '/observations/latest', { headers: HEADERS });
        })
        .then(function (r) { return r.json(); })
        .then(function (obs) {
          var p = obs.properties;
          var tempC = p.temperature && p.temperature.value != null ? Math.round(p.temperature.value) : null;
          var feelsC = p.windChill && p.windChill.value != null ? Math.round(p.windChill.value) :
            (p.heatIndex && p.heatIndex.value != null ? Math.round(p.heatIndex.value) : null);
          var windKmh = p.windSpeed && p.windSpeed.value != null ? Math.round(p.windSpeed.value * 3.6) : null;
          var decoded = decodeIcon(p.icon);

          return {
            temp: tempC,
            feelsLike: feelsC,
            humidity: p.relativeHumidity && p.relativeHumidity.value != null ? Math.round(p.relativeHumidity.value) : null,
            windSpeed: windKmh,
            windDir: p.windDirection && p.windDirection.value != null ? Math.round(p.windDirection.value) : null,
            pressure: p.barometricPressure && p.barometricPressure.value != null ? Math.round(p.barometricPressure.value / 100) : null,
            uv: null,
            visibility: p.visibility && p.visibility.value != null ? Math.round(p.visibility.value / 1000) + ' km' : null,
            description: p.textDescription || decoded.desc,
            icon: decoded.icon,
            sunrise: '--',
            sunset: '--',
            unit: '\u00B0C'
          };
        });
    });
  }

  function fetchFiveDay(lat, lon) {
    return getGridPoint(lat, lon).then(function (point) {
      var forecastUrl = point.properties.forecast;
      return fetch(forecastUrl, { headers: HEADERS })
        .then(function (r) { return r.json(); })
        .then(function (forecast) {
          return parsePeriods(forecast.properties.periods, 5);
        });
    });
  }

  function fetchThirtyDay(lat, lon) {
    return getGridPoint(lat, lon).then(function (point) {
      var forecastUrl = point.properties.forecast;
      return fetch(forecastUrl, { headers: HEADERS })
        .then(function (r) { return r.json(); })
        .then(function (forecast) {
          return parsePeriods(forecast.properties.periods, 30);
        });
    });
  }

  function parsePeriods(periods, maxDays) {
    // NWS returns periods (day/night pairs). Group them into days.
    var dayMap = {};
    var dayOrder = [];

    periods.forEach(function (p) {
      var dateStr = p.startTime.slice(0, 10);
      if (!dayMap[dateStr]) {
        dayMap[dateStr] = { high: null, low: null, icon: null, desc: null, precip: null };
        dayOrder.push(dateStr);
      }
      var tempC = p.temperatureUnit === 'F' ? fToC(p.temperature) : p.temperature;
      if (p.isDaytime) {
        dayMap[dateStr].high = tempC;
        dayMap[dateStr].icon = p.icon;
        dayMap[dateStr].desc = p.shortForecast;
        if (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value != null) {
          dayMap[dateStr].precip = p.probabilityOfPrecipitation.value;
        }
      } else {
        dayMap[dateStr].low = tempC;
        if (!dayMap[dateStr].icon) {
          dayMap[dateStr].icon = p.icon;
          dayMap[dateStr].desc = p.shortForecast;
        }
      }
    });

    var days = [];
    var count = Math.min(dayOrder.length, maxDays);
    for (var i = 0; i < count; i++) {
      var key = dayOrder[i];
      var d = dayMap[key];
      var decoded = decodeIcon(d.icon);
      days.push({
        date: key,
        high: d.high,
        low: d.low,
        description: d.desc || decoded.desc,
        icon: decoded.icon,
        precipChance: d.precip,
        precipAmount: null,
        unit: '\u00B0C',
        isEstimate: false
      });
    }
    return days;
  }

  function getInfoBanner() {
    return 'NWS provides up to 7 days of forecast data and only covers US locations.';
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
