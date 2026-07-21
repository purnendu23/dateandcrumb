const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

/**
 * Generate a hash for address deduplication/caching
 */
function hashAddress(address, city, state, zip) {
    const normalized = [address, city, state, zip]
        .map(s => (s || '').trim().toLowerCase().replace(/\s+/g, ' '))
        .join('|');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * POST /api/address/validate
 * Body: { address, city, state, zip }
 * Returns: { valid, corrected?: { address, city, state, zip }, confidence, cached }
 */
router.post('/validate', async (req, res) => {
    const db = req.app.locals.db;
    const { address, city, state, zip } = req.body;

    if (!address || !city || !zip) {
        return res.status(400).json({ error: 'Address, city, and zip are required.' });
    }

    const addrHash = hashAddress(address, city, state, zip);

    // 1. Check cache
    const [cached] = await db.execute('SELECT * FROM validated_addresses WHERE address_hash = ?', [addrHash]);
    if (cached.length > 0) {
        const c = cached[0];
        return res.json({
            valid: true,
            corrected: c.validated_address ? {
                address: c.validated_address,
                city: c.validated_city,
                state: c.validated_state,
                zip: c.validated_zip,
            } : null,
            confidence: c.confidence || 'cached',
            cached: true,
            provider: c.provider,
        });
    }

    // 2. Try Google Address Validation API
    if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here') {
        try {
            const result = await validateWithGoogle(address, city, state, zip);
            if (result) {
                await cacheResult(db, addrHash, address, city, state, zip, result);
                return res.json({ ...result, cached: false, provider: 'google' });
            }
        } catch (err) {
            console.error('Google Address Validation error:', err.message);
        }
    }

    // 3. Fallback to Mapbox
    if (MAPBOX_ACCESS_TOKEN && MAPBOX_ACCESS_TOKEN !== 'your_mapbox_access_token_here') {
        try {
            const result = await validateWithMapbox(address, city, state, zip);
            if (result) {
                await cacheResult(db, addrHash, address, city, state, zip, result);
                return res.json({ ...result, cached: false, provider: 'mapbox' });
            }
        } catch (err) {
            console.error('Mapbox Geocoding error:', err.message);
        }
    }

    // 4. No provider — accept as-is
    await cacheResult(db, addrHash, address, city, state, zip, {
        valid: true, corrected: null, confidence: 'unverified',
    });

    res.json({ valid: true, corrected: null, confidence: 'unverified', cached: false, provider: 'none' });
});

/**
 * Google Address Validation API
 */
async function validateWithGoogle(address, city, state, zip) {
    const body = {
        address: {
            regionCode: 'US',
            addressLines: [`${address}, ${city}, ${state} ${zip}`],
        },
    };

    const response = await fetch(
        `https://addressvalidation.googleapis.com/v1:validateAddress?key=${GOOGLE_MAPS_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }
    );

    if (!response.ok) {
        throw new Error(`Google API returned ${response.status}`);
    }

    const data = await response.json();
    const result = data.result;
    if (!result) return null;

    const verdict = result.verdict || {};
    const postalAddr = result.address?.postalAddress || {};

    const isValid = verdict.addressComplete !== false &&
                    verdict.validationGranularity !== 'OTHER' &&
                    verdict.validationGranularity !== 'ROUTE';

    // Extract corrected components
    const addressComponents = result.address?.addressComponents || [];

    let correctedCity = city, correctedState = state, correctedZip = zip, correctedStreet = address;

    for (const comp of addressComponents) {
        const type = comp.componentType;
        if (type === 'locality') correctedCity = comp.componentName?.text || city;
        if (type === 'administrative_area_level_1') correctedState = comp.componentName?.text || state;
        if (type === 'postal_code') correctedZip = comp.componentName?.text || zip;
    }

    // Use formatted address for street if available
    if (postalAddr.addressLines && postalAddr.addressLines.length > 0) {
        correctedStreet = postalAddr.addressLines[0];
    }

    const needsCorrection = correctedStreet.toLowerCase() !== address.toLowerCase() ||
                            correctedCity.toLowerCase() !== city.toLowerCase() ||
                            correctedZip !== zip;

    // Map granularity to confidence
    const granularity = verdict.validationGranularity || 'OTHER';
    let confidence = 'low';
    if (granularity === 'PREMISE' || granularity === 'SUB_PREMISE') confidence = 'high';
    else if (granularity === 'ROUTE') confidence = 'medium';

    return {
        valid: isValid,
        corrected: needsCorrection ? {
            address: correctedStreet,
            city: correctedCity,
            state: correctedState,
            zip: correctedZip,
        } : null,
        confidence,
    };
}

/**
 * Mapbox Geocoding API (v6)
 */
async function validateWithMapbox(address, city, state, zip) {
    const query = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${query}&country=us&limit=1&access_token=${MAPBOX_ACCESS_TOKEN}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Mapbox API returned ${response.status}`);
    }

    const data = await response.json();
    const features = data.features || [];
    if (features.length === 0) {
        return { valid: false, corrected: null, confidence: 'low' };
    }

    const feature = features[0];
    const props = feature.properties || {};
    const context = props.context || {};

    const correctedStreet = props.full_address ? props.full_address.split(',')[0] : address;
    const correctedCity = context.place?.name || city;
    const correctedState = context.region?.region_code || state;
    const correctedZip = context.postcode?.name || zip;

    const relevance = props.match_code?.confidence || 'low';
    let confidence = 'low';
    if (relevance === 'exact' || relevance === 'high') confidence = 'high';
    else if (relevance === 'medium') confidence = 'medium';

    const needsCorrection = correctedStreet.toLowerCase() !== address.toLowerCase() ||
                            correctedCity.toLowerCase() !== city.toLowerCase() ||
                            correctedZip !== zip;

    return {
        valid: confidence !== 'low',
        corrected: needsCorrection ? {
            address: correctedStreet,
            city: correctedCity,
            state: correctedState,
            zip: correctedZip,
        } : null,
        confidence,
    };
}

/**
 * Cache a validation result
 */
async function cacheResult(db, hash, rawAddr, rawCity, rawState, rawZip, result) {
    try {
        await db.execute(
            `INSERT IGNORE INTO validated_addresses (address_hash, raw_address, raw_city, raw_state, raw_zip,
             validated_address, validated_city, validated_state, validated_zip, provider, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                hash, rawAddr, rawCity, rawState, rawZip,
                result.corrected?.address || null,
                result.corrected?.city || null,
                result.corrected?.state || null,
                result.corrected?.zip || null,
                result.provider || 'unknown',
                result.confidence || 'unknown'
            ]
        );
    } catch (e) {
        console.error('Failed to cache address validation:', e.message);
    }
}

module.exports = router;
