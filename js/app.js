/**
 * Simply Weather — Main Application
 * Pure HTML/JS weather app with selectable open data sources.
 */
(function () {
  'use strict';

  // ===== Data Sources Registry =====
  var sources = {
    'open-meteo': OpenMeteoSource,
    'met-norway': MetNorwaySource,
    'nws': NWSSource
  };

  // ===== State =====
  var state = {
    lat: null,
    lon: null,
    locationName: '',
    source: 'open-meteo',
    activeView: 'current',
    cache: {} // keyed by source+view+lat+lon
  };

  // ===== DOM References =====
  var $ = function (id) { return document.getElementById(id); };
  var geoBtn = $('geolocate-btn');
  var searchBtn = $('search-btn');
  var locationInput = $('location-input');
  var sourceSelect = $('data-source');
  var locationDisplay = $('location-display');
  var loadingEl = $('loading');
  var errorEl = $('error');
  var errorMsg = $('error-message');
  var retryBtn = $('retry-btn');
  var attribution = $('source-attribution');
  var tabs = document.querySelectorAll('.tab');
  var views = {
    current: $('view-current'),
    'five-day': $('view-five-day'),
    'thirty-day': $('view-thirty-day')
  };

  // ===== Helpers =====
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showLoading() {
    show(loadingEl);
    hide(errorEl);
    Object.keys(views).forEach(function (k) { hide(views[k]); });
  }

  function hideLoading() {
    hide(loadingEl);
  }

  function showError(msg) {
    hideLoading();
    errorMsg.textContent = msg;
    show(errorEl);
    Object.keys(views).forEach(function (k) { hide(views[k]); });
  }

  function showView(viewName) {
    hide(errorEl);
    Object.keys(views).forEach(function (k) {
      if (k === viewName) show(views[k]);
      else hide(views[k]);
    });
  }

  function cacheKey(source, view, lat, lon) {
    return source + ':' + view + ':' + lat.toFixed(2) + ':' + lon.toFixed(2);
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      day: days[d.getDay()],
      date: months[d.getMonth()] + ' ' + d.getDate()
    };
  }

  function windDirection(deg) {
    if (deg == null) return '';
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  // ===== Geolocation =====
  function geolocate() {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by your browser.');
      return;
    }
    showLoading();
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.lat = pos.coords.latitude;
        state.lon = pos.coords.longitude;
        reverseGeocode(state.lat, state.lon).then(function (name) {
          state.locationName = name;
          locationDisplay.textContent = name + ' (' + state.lat.toFixed(2) + ', ' + state.lon.toFixed(2) + ')';
          locationInput.value = name;
          loadWeather();
        });
      },
      function (err) {
        hideLoading();
        showError('Location access denied. Please search for a city or enter coordinates.');
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function reverseGeocode(lat, lon) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=_&count=1&latitude=' + lat + '&longitude=' + lon;
    // Use Open-Meteo reverse geocoding
    var reverseUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&zoom=10';
    return fetch(reverseUrl, {
      headers: { 'User-Agent': 'SimplyWeather/1.0' }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.address) {
          var parts = [];
          if (data.address.city || data.address.town || data.address.village) {
            parts.push(data.address.city || data.address.town || data.address.village);
          }
          if (data.address.state) parts.push(data.address.state);
          if (data.address.country) parts.push(data.address.country);
          return parts.join(', ') || 'Unknown location';
        }
        return data.display_name || 'Unknown location';
      })
      .catch(function () {
        return lat.toFixed(2) + ', ' + lon.toFixed(2);
      });
  }

  // ===== Search =====
  function searchLocation(query) {
    if (!query.trim()) return;

    // Check if input is coordinates (lat, lon)
    var coordMatch = query.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
    if (coordMatch) {
      state.lat = parseFloat(coordMatch[1]);
      state.lon = parseFloat(coordMatch[2]);
      reverseGeocode(state.lat, state.lon).then(function (name) {
        state.locationName = name;
        locationDisplay.textContent = name + ' (' + state.lat.toFixed(2) + ', ' + state.lon.toFixed(2) + ')';
        loadWeather();
      });
      return;
    }

    // Geocode city name using Open-Meteo geocoding API (free, no key)
    showLoading();
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) + '&count=1&language=en';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.results || data.results.length === 0) {
          showError('Location "' + query + '" not found. Try a different city name or use coordinates.');
          return;
        }
        var loc = data.results[0];
        state.lat = loc.latitude;
        state.lon = loc.longitude;
        var parts = [loc.name];
        if (loc.admin1) parts.push(loc.admin1);
        if (loc.country) parts.push(loc.country);
        state.locationName = parts.join(', ');
        locationDisplay.textContent = state.locationName + ' (' + state.lat.toFixed(2) + ', ' + state.lon.toFixed(2) + ')';
        loadWeather();
      })
      .catch(function (err) {
        showError('Failed to search location: ' + err.message);
      });
  }

  // ===== Rendering =====
  function renderCurrent(data) {
    $('current-icon').textContent = data.icon;
    $('current-temp').textContent = (data.temp != null ? data.temp + data.unit : '--');
    $('current-desc').textContent = data.description;
    $('current-feels').textContent = data.feelsLike != null ? data.feelsLike + data.unit : '--';
    $('current-humidity').textContent = data.humidity != null ? data.humidity + '%' : '--';
    $('current-wind').textContent = data.windSpeed != null ?
      data.windSpeed + ' km/h ' + windDirection(data.windDir) : '--';
    $('current-pressure').textContent = data.pressure != null ? data.pressure + ' hPa' : '--';
    $('current-uv').textContent = data.uv != null ? data.uv : '--';
    $('current-visibility').textContent = data.visibility || '--';
    $('current-sunrise').textContent = data.sunrise;
    $('current-sunset').textContent = data.sunset;
  }

  function renderForecast(containerId, days) {
    var container = $(containerId);
    container.innerHTML = '';
    days.forEach(function (day) {
      var f = formatDate(day.date);
      var card = document.createElement('div');
      card.className = 'forecast-card' + (day.isEstimate ? ' forecast-card--estimate' : '');
      var precipHtml = '';
      if (day.precipChance != null) {
        precipHtml = '<div class="forecast-card__precip">\uD83D\uDCA7 ' + day.precipChance + '%</div>';
      } else if (day.precipAmount != null && day.precipAmount > 0) {
        precipHtml = '<div class="forecast-card__precip">\uD83D\uDCA7 ' + day.precipAmount + ' mm</div>';
      }
      var estimateLabel = day.isEstimate ? ' <span style="font-size:0.65rem;color:#fbbf24;">(est.)</span>' : '';
      card.innerHTML =
        '<div class="forecast-card__day">' + f.day + estimateLabel + '</div>' +
        '<div class="forecast-card__date">' + f.date + '</div>' +
        '<div class="forecast-card__icon">' + day.icon + '</div>' +
        '<div class="forecast-card__temps">' +
        '<span class="forecast-card__high">' + (day.high != null ? day.high + '\u00B0' : '--') + '</span>' +
        '<span class="forecast-card__low">' + (day.low != null ? day.low + '\u00B0' : '--') + '</span>' +
        '</div>' +
        '<div class="forecast-card__desc">' + day.description + '</div>' +
        precipHtml;
      container.appendChild(card);
    });
  }

  // ===== Data Loading =====
  function loadWeather() {
    if (state.lat == null || state.lon == null) {
      showError('Please select a location first.');
      return;
    }

    var src = sources[state.source];
    if (!src) {
      showError('Unknown data source.');
      return;
    }

    attribution.textContent = src.attribution;
    showLoading();

    var view = state.activeView;
    var key = cacheKey(state.source, view, state.lat, state.lon);

    // Check cache
    if (state.cache[key]) {
      hideLoading();
      renderView(view, state.cache[key]);
      return;
    }

    var promise;
    if (view === 'current') {
      promise = src.fetchCurrent(state.lat, state.lon);
    } else if (view === 'five-day') {
      promise = src.fetchFiveDay(state.lat, state.lon);
    } else if (view === 'thirty-day') {
      promise = src.fetchThirtyDay(state.lat, state.lon);
    }

    promise
      .then(function (data) {
        state.cache[key] = data;
        hideLoading();
        renderView(view, data);
      })
      .catch(function (err) {
        showError(err.message || 'Failed to fetch weather data.');
      });
  }

  function renderView(view, data) {
    if (view === 'current') {
      renderCurrent(data);
      showView('current');
    } else if (view === 'five-day') {
      renderForecast('five-day-grid', data);
      showView('five-day');
    } else if (view === 'thirty-day') {
      var banner = sources[state.source].getInfoBanner();
      var bannerEl = $('thirty-day-info');
      if (banner) {
        bannerEl.querySelector('p').textContent = banner;
        show(bannerEl);
      } else {
        hide(bannerEl);
      }
      renderForecast('thirty-day-grid', data);
      showView('thirty-day');
    }
  }

  // ===== Event Handlers =====
  geoBtn.addEventListener('click', function () {
    state.cache = {};
    geolocate();
  });

  searchBtn.addEventListener('click', function () {
    state.cache = {};
    searchLocation(locationInput.value);
  });

  locationInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      state.cache = {};
      searchLocation(locationInput.value);
    }
  });

  sourceSelect.addEventListener('change', function () {
    state.source = sourceSelect.value;
    state.cache = {};
    attribution.textContent = sources[state.source].attribution;
    if (state.lat != null && state.lon != null) {
      loadWeather();
    }
  });

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('tab--active'); });
      tab.classList.add('tab--active');
      state.activeView = tab.getAttribute('data-view');
      if (state.lat != null && state.lon != null) {
        loadWeather();
      }
    });
  });

  retryBtn.addEventListener('click', function () {
    loadWeather();
  });

  // ===== Initialize =====
  // Auto-detect location on load
  geolocate();

})();
