/**
 * Address Autocomplete — Google Places (primary) with Mapbox fallback
 * Loads dynamically based on available API keys from /api/config
 * Sets window._addressAutoCompleted when user picks a suggestion
 */
(async function () {
    // Only run on checkout page
    const addressInput = document.getElementById('shipping_address');
    if (!addressInput) return;

    let config = {};
    try {
        const res = await fetch('/api/config');
        config = await res.json();
    } catch (e) {
        return; // No config available
    }

    // Track autocomplete state
    window._addressAutoCompleted = null;

    // Reset autocomplete flag when user manually types in any address field
    ['shipping_address', 'shipping_city', 'shipping_state', 'shipping_zip'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                window._addressAutoCompleted = null;
            });
        }
    });

    // State abbreviation map
    const stateAbbrMap = {
        'new york': 'NY', 'ny': 'NY',
        'new jersey': 'NJ', 'nj': 'NJ',
        'connecticut': 'CT', 'ct': 'CT',
    };

    function normalizeState(state) {
        if (!state) return '';
        const lower = state.toLowerCase().trim();
        return stateAbbrMap[lower] || state.toUpperCase();
    }

    // ─── Try Google Places Autocomplete ──────────────────
    if (config.googleMapsApiKey && config.googleMapsApiKey !== 'your_google_maps_api_key_here') {
        try {
            await loadGooglePlaces(config.googleMapsApiKey);
            return; // Success — don't load Mapbox
        } catch (err) {
            console.warn('Google Places failed to load, trying Mapbox fallback:', err.message);
        }
    }

    // ─── Fallback: Mapbox Search ─────────────────────────
    if (config.mapboxAccessToken && config.mapboxAccessToken !== 'your_mapbox_access_token_here') {
        try {
            await loadMapboxAutofill(config.mapboxAccessToken);
        } catch (err) {
            console.warn('Mapbox autofill failed to load:', err.message);
        }
    }

    // ─── Google Places Implementation ────────────────────
    function loadGooglePlaces(apiKey) {
        return new Promise((resolve, reject) => {
            const previousAuthFailureHandler = window.gm_authFailure;
            let settled = false;

            function cleanup() {
                if (window.gm_authFailure === onAuthFailure) {
                    if (previousAuthFailureHandler) {
                        window.gm_authFailure = previousAuthFailureHandler;
                    } else {
                        delete window.gm_authFailure;
                    }
                }
            }

            function resolveOnce() {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            }

            function rejectOnce(message) {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error(message));
            }

            function onAuthFailure() {
                rejectOnce('Google Maps authentication failed');
                if (typeof previousAuthFailureHandler === 'function') {
                    previousAuthFailureHandler();
                }
            }

            window.gm_authFailure = onAuthFailure;

            if (window.google?.maps?.importLibrary) {
                initGoogleAutocomplete().then(resolveOnce).catch((err) => {
                    rejectOnce(err?.message || 'Google Places initialization failed');
                });
                return;
            }

            // Use loading=async with a named callback — required by the new Google Maps API
            const callbackName = '__googleMapsReady_' + Date.now();
            window[callbackName] = () => {
                delete window[callbackName];
                initGoogleAutocomplete().then(() => {
                    // Give Google a brief window to report auth failures before treating as success.
                    setTimeout(resolveOnce, 400);
                }).catch((err) => {
                    rejectOnce(err.message || 'Google Places initialization failed');
                });
            };

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places&loading=async&callback=${callbackName}`;
            script.async = true;
            script.onerror = () => rejectOnce('Google Maps script failed to load');

            document.head.appendChild(script);
        });
    }

    async function initGoogleAutocomplete() {
        if (google.maps.importLibrary) {
            await google.maps.importLibrary('places');
        }
        const AutocompleteCtor = google.maps?.places?.Autocomplete;
        if (!AutocompleteCtor) {
            throw new Error('Google Places Autocomplete is unavailable');
        }

        const autocomplete = new AutocompleteCtor(addressInput, {
            componentRestrictions: { country: 'us' },
            fields: ['address_components', 'formatted_address'],
            types: ['address'],
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.address_components) return;

            let streetNumber = '';
            let route = '';
            let city = '';
            let state = '';
            let zip = '';
            let hasStreetNumber = false;

            for (const comp of place.address_components) {
                const type = comp.types[0];
                if (type === 'street_number') { streetNumber = comp.long_name; hasStreetNumber = true; }
                if (type === 'route') route = comp.long_name;
                if (type === 'locality' || type === 'sublocality_level_1') city = comp.long_name;
                if (type === 'administrative_area_level_1') state = comp.short_name;
                if (type === 'postal_code') zip = comp.long_name;
            }

            const streetAddr = streetNumber ? `${streetNumber} ${route}` : route;

            addressInput.value = streetAddr;
            document.getElementById('shipping_city').value = city;
            const stateAbbr = normalizeState(state);
            const stateSelect = document.getElementById('shipping_state');
            if (stateSelect.querySelector(`option[value="${stateAbbr}"]`)) {
                stateSelect.value = stateAbbr;
            }
            document.getElementById('shipping_zip').value = zip;

            window._addressAutoCompleted = {
                source: 'google',
                hasStreetNumber,
                city,
                state: stateAbbr,
                zip,
            };
        });
    }

    // ─── Mapbox Implementation ───────────────────────────
    function loadMapboxAutofill(token) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.mapbox.com/search-js/v1.0.0-beta.22/web.js';
            script.async = true;

            script.onload = () => {
                try {
                    initMapboxAutofill(token);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            script.onerror = () => reject(new Error('Mapbox script failed to load'));

            document.head.appendChild(script);
        });
    }

    function initMapboxAutofill(token) {
        if (!window.mapboxsearch) {
            // Mapbox Search JS not loaded — use simple geocoding-based autocomplete
            initMapboxSimple(token);
            return;
        }

        try {
            const autofill = mapboxsearch.autofill({
                accessToken: token,
                options: { country: 'US' },
            });

            addressInput.addEventListener('mapboxsearch.autofill', (e) => {
                const feature = e.detail;
                if (!feature) return;
                const props = feature.properties || {};
                const ctx = props.context || {};

                document.getElementById('shipping_city').value = ctx.place?.name || '';
                const stateAbbr = normalizeState(ctx.region?.region_code || '');
                const stateSelect = document.getElementById('shipping_state');
                if (stateSelect.querySelector(`option[value="${stateAbbr}"]`)) {
                    stateSelect.value = stateAbbr;
                }
                document.getElementById('shipping_zip').value = ctx.postcode?.name || '';

                window._addressAutoCompleted = {
                    source: 'mapbox',
                    hasStreetNumber: /^\d/.test(addressInput.value),
                    city: ctx.place?.name || '',
                    state: stateAbbr,
                    zip: ctx.postcode?.name || '',
                };
            });
        } catch (e) {
            initMapboxSimple(token);
        }
    }

    // Simple Mapbox geocoding-based autocomplete (dropdown)
    function initMapboxSimple(token) {
        let debounceTimer = null;
        let dropdown = null;

        function createDropdown() {
            if (dropdown) return dropdown;
            dropdown = document.createElement('div');
            dropdown.style.cssText = 'position:absolute;z-index:999;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-height:200px;overflow-y:auto;width:100%;';
            addressInput.parentElement.style.position = 'relative';
            addressInput.parentElement.appendChild(dropdown);
            return dropdown;
        }

        addressInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const val = addressInput.value.trim();
            if (val.length < 4) {
                if (dropdown) dropdown.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(async () => {
                try {
                    const q = encodeURIComponent(val);
                    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${q}&country=us&types=address&limit=5&access_token=${token}`);
                    const data = await res.json();
                    const features = data.features || [];

                    const dd = createDropdown();
                    if (features.length === 0) {
                        dd.style.display = 'none';
                        return;
                    }

                    dd.innerHTML = features.map((f, i) => {
                        const name = f.properties?.full_address || f.properties?.name || '';
                        return `<div data-index="${i}" style="padding:0.6rem 0.8rem;cursor:pointer;font-size:0.9rem;border-bottom:1px solid #f0f0f0;">${escapeHTMLSimple(name)}</div>`;
                    }).join('');
                    dd.style.display = 'block';

                    dd.querySelectorAll('div[data-index]').forEach(el => {
                        el.addEventListener('mouseover', () => { el.style.background = '#f5f0eb'; });
                        el.addEventListener('mouseout', () => { el.style.background = '#fff'; });
                        el.addEventListener('click', () => {
                            const idx = parseInt(el.dataset.index, 10);
                            const f = features[idx];
                            const props = f.properties || {};
                            const ctx = props.context || {};

                            const street = props.name || props.full_address?.split(',')[0] || '';
                            addressInput.value = street;
                            document.getElementById('shipping_city').value = ctx.place?.name || '';
                            const stateAbbr = normalizeState(ctx.region?.region_code || '');
                            const stateSelect = document.getElementById('shipping_state');
                            if (stateSelect.querySelector(`option[value="${stateAbbr}"]`)) {
                                stateSelect.value = stateAbbr;
                            }
                            document.getElementById('shipping_zip').value = ctx.postcode?.name || '';

                            window._addressAutoCompleted = {
                                source: 'mapbox',
                                hasStreetNumber: /^\d/.test(street),
                                city: ctx.place?.name || '',
                                state: stateAbbr,
                                zip: ctx.postcode?.name || '',
                            };

                            dd.style.display = 'none';
                        });
                    });
                } catch (err) {
                    console.error('Mapbox geocoding error:', err);
                }
            }, 300);
        });

        // Hide dropdown on outside click
        document.addEventListener('click', (e) => {
            if (dropdown && !addressInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function escapeHTMLSimple(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
})();
