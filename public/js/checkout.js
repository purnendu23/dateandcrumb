/* Checkout page — multi-step: Shipping → Payment → Review → Place Order */

// ─── Phone number auto-format (XXX-XXX-XXXX) ────────────
document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('customer_phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            const cursorPos = this.selectionStart;
            const oldLength = this.value.length;
            const digits = this.value.replace(/\D/g, '').substring(0, 10);
            let formatted;

            if (digits.length > 6) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
            } else if (digits.length > 3) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3);
            } else {
                formatted = digits;
            }

            this.value = formatted;

            // Adjust cursor position after inserting dashes.
            const newLength = this.value.length;
            const diff = newLength - oldLength;
            this.setSelectionRange(cursorPos + diff, cursorPos + diff);
        });
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    await Cart._ready;

    const items = Cart.getItems();
    const form = document.getElementById('checkout-form');
    const formWrapper = document.getElementById('checkout-form-wrapper');
    const confirmation = document.getElementById('order-confirmation');
    const checkoutItems = document.getElementById('checkout-items');
    const checkoutTotal = document.getElementById('checkout-total');

    if (!form || !formWrapper || !confirmation || !checkoutItems || !checkoutTotal) {
        console.error('Checkout page is missing required DOM elements.');
        return;
    }

    if (items.length === 0) {
        formWrapper.innerHTML = `
            <div class="cart-empty">
                <p>Your cart is empty. Add items before checking out.</p>
                <a href="/products.html" class="btn btn-primary">Browse Products</a>
            </div>
        `;
        return;
    }

    // ========================================================
    // Order summary + Stripe Tax state
    // ========================================================

    checkoutItems.innerHTML = items.map(item => `
        <div class="checkout-item">
            <span>${escapeHTML(item.name)} &times; ${item.quantity}</span>
            <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('') + `
        <div class="checkout-item" id="checkout-tax-row" style="display:none;">
            <span>Sales tax</span>
            <span id="checkout-tax-amount">$0.00</span>
        </div>
    `;

    const checkoutTaxRow = document.getElementById('checkout-tax-row');
    const checkoutTaxAmount = document.getElementById('checkout-tax-amount');

    let taxQuote = null;

    function getCartPayload() {
        return items.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
        }));
    }
    function getCustomerName() {
        const first = form.customer_first_name.value.trim();
        const last = form.customer_last_name.value.trim();
        return `${first} ${last}`.trim().replace(/\s+/g, ' ');
    }

    function getShippingPayload() {
        return {
            name: getCustomerName(),
            address: {
                line1: form.shipping_address.value.trim(),
                line2: form.shipping_address2.value.trim(),
                city: form.shipping_city.value.trim(),
                state: form.shipping_state.value,
                postal_code: form.shipping_zip.value.trim(),
                country: 'US',
            },
        };
    }

    function shippingFingerprint() {
        const shipping = getShippingPayload();
        return [
            shipping.address.line1,
            shipping.address.line2,
            shipping.address.city,
            shipping.address.state,
            shipping.address.postal_code,
            shipping.address.country,
        ].map(value => String(value || '').trim().toLowerCase()).join('|');
    }

    function renderTaxSummary() {
        if (!taxQuote) {
            if (checkoutTaxRow) checkoutTaxRow.style.display = 'none';
            checkoutTotal.textContent = Cart.getTotal().toFixed(2);
            return;
        }

        if (checkoutTaxRow) checkoutTaxRow.style.display = '';
        if (checkoutTaxAmount) {
            checkoutTaxAmount.textContent = `$${(taxQuote.tax / 100).toFixed(2)}`;
        }
        checkoutTotal.textContent = (taxQuote.total / 100).toFixed(2);
    }

    function invalidateTaxQuote() {
        taxQuote = null;
        renderTaxSummary();
    }

    renderTaxSummary();

    // If the customer goes back and changes any destination field, the old
    // Stripe Tax result must not be reused.
    [
        form.shipping_address,
        form.shipping_address2,
        form.shipping_city,
        form.shipping_state,
        form.shipping_zip,
    ].forEach(field => {
        if (!field) return;
        field.addEventListener('input', invalidateTaxQuote);
        field.addEventListener('change', invalidateTaxQuote);
    });

    async function calculateTaxQuote() {
        const response = await fetch('/api/payments/stripe/calculate-tax', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: getCartPayload(),
                shipping: getShippingPayload(),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Unable to calculate sales tax.');
        }

        taxQuote = {
            id: data.taxCalculationId,
            subtotal: Number(data.subtotal),
            tax: Number(data.tax),
            total: Number(data.total),
            expiresAt: data.expiresAt,
            shippingFingerprint: shippingFingerprint(),
        };

        renderTaxSummary();

        if (paymentRequest) {
            paymentRequest.update({
                total: {
                    label: 'Bakehouse Order',
                    amount: taxQuote.total,
                },
            });
        }

        return taxQuote;
    }

    async function ensureFreshTaxQuote() {
        const isExpired = taxQuote?.expiresAt &&
            Number(taxQuote.expiresAt) <= Math.floor(Date.now() / 1000);

        const addressChanged = taxQuote &&
            taxQuote.shippingFingerprint !== shippingFingerprint();

        if (!taxQuote || isExpired || addressChanged) {
            return calculateTaxQuote();
        }

        return taxQuote;
    }

    async function createPaymentIntent() {
        await ensureFreshTaxQuote();

        const response = await fetch('/api/payments/stripe/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: getCartPayload(),
                shipping: getShippingPayload(),
                customer_email: form.customer_email.value.trim(),
                customer_phone: form.customer_phone.value.trim(),
                tax_calculation_id: taxQuote.id,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            if (
                data.code === 'TAX_QUOTE_EXPIRED' ||
                data.code === 'TAX_ADDRESS_CHANGED' ||
                data.code === 'TAX_CART_CHANGED' ||
                data.code === 'TAX_PRICE_CHANGED'
            ) {
                invalidateTaxQuote();
            }

            throw new Error(data.error || 'Failed to initialize payment.');
        }

        // Server is authoritative; refresh the displayed amounts with the
        // exact values attached to the PaymentIntent.
        taxQuote = {
            ...taxQuote,
            id: data.taxCalculationId,
            subtotal: Number(data.subtotal),
            tax: Number(data.tax),
            total: Number(data.total),
            shippingFingerprint: shippingFingerprint(),
        };
        renderTaxSummary();

        return data;
    }

    async function continueToPaymentWithTax(errEl, button) {
        const oldText = button ? button.textContent : '';

        if (button) {
            button.disabled = true;
            button.textContent = 'Calculating tax…';
        }

        try {
            await ensureFreshTaxQuote();
            if (errEl) errEl.style.display = 'none';
            goToStep(1);
            mountStripeCard();
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Unable to calculate sales tax.';
                errEl.style.display = 'block';
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = oldText || 'Continue to Payment';
            }
        }
    }

    // ========================================================
    // "Use profile info"
    // ========================================================

    let profileData = null;
    let isLoggedIn = false;

    try {
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();

        if (meData.user) {
            isLoggedIn = true;
            const profRes = await fetch('/api/auth/profile');
            const profData = await profRes.json();

            if (profData.profile) {
                profileData = profData.profile;
                const wrapper = document.getElementById('use-profile-wrapper');
                if (wrapper) wrapper.style.display = '';
            }
        }
    } catch (e) {
        // Not logged in or fetch failed — keep checkbox hidden.
    }

    const useProfileCheckbox = document.getElementById('use-profile-info');
    const btnUseProfile = document.getElementById('btn-use-profile');

    if (btnUseProfile && profileData) {
        btnUseProfile.addEventListener('click', () => {
            form.customer_first_name.value = profileData.first_name || '';
            form.customer_last_name.value = profileData.last_name || '';
            form.customer_email.value = profileData.email || '';
            form.customer_phone.value = profileData.phone || '';
            form.shipping_address.value = profileData.shipping_address || '';
            form.shipping_address2.value = profileData.shipping_address2 || '';
            form.shipping_city.value = profileData.shipping_city || '';
            form.shipping_state.value = profileData.shipping_state || '';
            form.shipping_zip.value = profileData.shipping_zip || '';
            invalidateTaxQuote();
        });
    }

    // ========================================================
    // Address Book
    // ========================================================

    const btnAddressBook = document.getElementById('btn-address-book');
    const addressBookModal = document.getElementById('address-book-modal');
    const closeAddressBook = document.getElementById('close-address-book');

    if (btnAddressBook && addressBookModal) {
        btnAddressBook.addEventListener('click', async () => {
            addressBookModal.style.display = 'flex';
            const listEl = document.getElementById('address-book-list');
            listEl.innerHTML = '<p style="color:var(--color-text-light);">Loading...</p>';

            try {
                const res = await fetch('/api/auth/addresses');
                const data = await res.json();

                if (!data.addresses || data.addresses.length === 0) {
                    listEl.innerHTML = '<p style="color:var(--color-text-light);">No saved addresses yet. Addresses from your orders will appear here automatically.</p>';
                    return;
                }

                listEl.innerHTML = data.addresses.map((addr, idx) => `
                    <div class="address-book-entry" data-index="${idx}" style="border:1px solid #e0e0e0; border-radius:8px; padding:1rem; margin-bottom:0.75rem; cursor:pointer; transition:background 0.2s;">
                        ${addr.label ? `<div style="font-weight:600; font-size:0.8rem; color:var(--color-primary); text-transform:uppercase; margin-bottom:0.25rem;">${escapeHTML(addr.label)}${addr.is_default ? ' ★' : ''}</div>` : ''}
                        <div style="font-weight:600;">${escapeHTML((`${addr.first_name || ''} ${addr.last_name || ''}`).trim() || addr.name || '')}</div>
                        <div>${escapeHTML(addr.address)}${addr.address2 ? ', ' + escapeHTML(addr.address2) : ''}</div>
                        <div>${escapeHTML(addr.city)}${addr.state ? ', ' + escapeHTML(addr.state) : ''} ${escapeHTML(addr.zip)}</div>
                        ${addr.phone ? `<div style="color:var(--color-text-light); font-size:0.9rem;">${escapeHTML(addr.phone)}</div>` : ''}
                    </div>
                `).join('');

                listEl.querySelectorAll('.address-book-entry').forEach((entry) => {
                    entry.addEventListener('click', () => {
                        const idx = parseInt(entry.dataset.index, 10);
                        const addr = data.addresses[idx];

                        form.customer_first_name.value = addr.first_name || '';
                        form.customer_last_name.value = addr.last_name || '';
                        form.customer_phone.value = addr.phone || '';
                        form.shipping_address.value = addr.address || '';
                        form.shipping_address2.value = addr.address2 || '';
                        form.shipping_city.value = addr.city || '';
                        form.shipping_state.value = addr.state || '';
                        form.shipping_zip.value = addr.zip || '';

                        if (profileData && !form.customer_email.value) {
                            form.customer_email.value = profileData.email || '';
                        }

                        if (useProfileCheckbox) useProfileCheckbox.checked = false;
                        invalidateTaxQuote();
                        addressBookModal.style.display = 'none';
                    });

                    entry.addEventListener('mouseover', () => {
                        entry.style.background = '#f5f0eb';
                    });
                    entry.addEventListener('mouseout', () => {
                        entry.style.background = '#fff';
                    });
                });
            } catch (err) {
                listEl.innerHTML = '<p style="color:var(--color-error);">Failed to load addresses.</p>';
            }
        });
    }

    if (closeAddressBook && addressBookModal) {
        closeAddressBook.addEventListener('click', () => {
            addressBookModal.style.display = 'none';
        });
    }

    if (addressBookModal) {
        addressBookModal.addEventListener('click', (e) => {
            if (e.target === addressBookModal) addressBookModal.style.display = 'none';
        });
    }

    // ========================================================
    // Fetch payment config
    // ========================================================

    let stripePublicKey = null;
    let stripe = null;

    try {
        const configRes = await fetch('/api/payments/config');
        const config = await configRes.json();
        stripePublicKey = config.stripePublicKey;
    } catch (e) {
        console.error('Failed to load payment config:', e);
    }

    // ========================================================
    // Initialize Stripe Card Element
    // ========================================================

    let stripeElements = null;
    let cardMounted = false;
    let cardElement = null;

    if (stripePublicKey && window.Stripe) {
        stripe = Stripe(stripePublicKey);
        stripeElements = stripe.elements();
    } else {
        const cardNumberEl = document.getElementById('stripe-card-number');
        if (cardNumberEl) {
            cardNumberEl.innerHTML =
                '<p style="color:#c00;">Stripe is not configured. Card payments are unavailable.</p>';
        }
    }

    function mountStripeCard() {
        if (!stripeElements || cardMounted) return;

        const elementStyle = {
            base: {
                fontSize: '16px',
                color: '#333',
                fontFamily: '"Inter", system-ui, sans-serif',
                '::placeholder': { color: '#999' },
            },
        };

        cardElement = stripeElements.create('card', {
            style: elementStyle,
            disableLink: true,
            hidePostalCode: true,
        });

        const cardNumberEl = document.getElementById('stripe-card-number');
        if (!cardNumberEl) return;

        cardNumberEl.innerHTML = '';
        cardElement.mount('#stripe-card-number');

        const expiryEl = document.getElementById('stripe-card-expiry');
        const cvcEl = document.getElementById('stripe-card-cvc');
        const expiryGroup = expiryEl ? expiryEl.closest('.form-group') : null;
        const cvcGroup = cvcEl ? cvcEl.closest('.form-group') : null;

        if (expiryGroup) expiryGroup.style.display = 'none';
        if (cvcGroup) cvcGroup.style.display = 'none';

        const formRow = expiryGroup?.parentElement;
        if (formRow && formRow.classList.contains('form-row')) {
            formRow.style.display = 'none';
        }

        const errEl = document.getElementById('stripe-card-errors');
        cardElement.on('change', (event) => {
            if (errEl) errEl.textContent = event.error ? event.error.message : '';
        });

        cardMounted = true;
    }

    // ========================================================
    // Google Pay / Apple Pay via existing Payment Request Button
    // NOTE: Stripe now recommends Express Checkout Element for new builds,
    // but this preserves your current HTML and wallet flow.
    // ========================================================

    let paymentRequest = null;
    let walletAvailable = false;
    let paymentRequestButton = null;
    let walletButtonMounted = false;

    if (stripe) {
        paymentRequest = stripe.paymentRequest({
            country: 'US',
            currency: 'usd',
            total: {
                label: 'Bakehouse Order',
                amount: Math.round(Cart.getTotal() * 100),
            },
            requestPayerName: false,
            requestPayerEmail: false,
        });

        paymentRequest.canMakePayment().then(result => {
            walletAvailable = !!result;

            const gpayOpt = document.querySelector('[data-method="google_pay"]');
            const apayOpt = document.querySelector('[data-method="apple_pay"]');

            if (!result) {
                if (gpayOpt) gpayOpt.style.display = 'none';
                if (apayOpt) apayOpt.style.display = 'none';
                return;
            }

            if (!result.googlePay && gpayOpt) gpayOpt.style.display = 'none';
            if (!result.applePay && apayOpt) apayOpt.style.display = 'none';
        });
    } else {
        const gpayOpt = document.querySelector('[data-method="google_pay"]');
        const apayOpt = document.querySelector('[data-method="apple_pay"]');
        if (gpayOpt) gpayOpt.style.display = 'none';
        if (apayOpt) apayOpt.style.display = 'none';
    }

    function determineWalletMethod(paymentMethod) {
        const walletType = paymentMethod?.card?.wallet?.type;
        if (walletType === 'apple_pay') return 'apple_pay';
        if (walletType === 'google_pay') return 'google_pay';
        return selectedMethod === 'apple_pay' ? 'apple_pay' : 'google_pay';
    }

    async function mountWalletButtonIfNeeded() {
        if (!paymentRequest || !stripeElements || walletButtonMounted) return;

        const container = document.getElementById('wallet-place-order-btn');
        if (!container) return;

        if (taxQuote) {
            paymentRequest.update({
                total: {
                    label: 'Bakehouse Order',
                    amount: taxQuote.total,
                },
            });
        }

        paymentRequestButton = stripeElements.create('paymentRequestButton', {
            paymentRequest,
        });

        container.innerHTML = '';
        paymentRequestButton.mount('#wallet-place-order-btn');
        walletButtonMounted = true;
    }

    if (paymentRequest) {
        paymentRequest.on('paymentmethod', async (ev) => {
            try {
                hideCheckoutError();

                await ensureFreshTaxQuote();

                // Make certain the wallet sheet and the PaymentIntent use the
                // exact same grand total.
                paymentRequest.update({
                    total: {
                        label: 'Bakehouse Order',
                        amount: taxQuote.total,
                    },
                });

                const intentData = await createPaymentIntent();

                const { error, paymentIntent } = await stripe.confirmCardPayment(
                    intentData.clientSecret,
                    { payment_method: ev.paymentMethod.id },
                    { handleActions: false }
                );

                if (error) {
                    ev.complete('fail');
                    showCheckoutError(error.message);
                    return;
                }

                ev.complete('success');

                let finalIntent = paymentIntent;

                if (paymentIntent.status === 'requires_action') {
                    const actionResult = await stripe.confirmCardPayment(intentData.clientSecret);

                    if (actionResult.error) {
                        showCheckoutError(actionResult.error.message);
                        return;
                    }

                    finalIntent = actionResult.paymentIntent;
                }

                if (finalIntent?.status === 'succeeded') {
                    const method = determineWalletMethod(ev.paymentMethod);
                    await placeOrder(method, finalIntent.id);
                } else {
                    showCheckoutError('Payment was not completed. Please try again.');
                }
            } catch (err) {
                try {
                    ev.complete('fail');
                } catch (_) {
                    // The wallet sheet may already have been completed.
                }
                showCheckoutError(err.message || 'Network error. Please check your connection and try again.');
            }
        });
    }

    // ========================================================
    // Step navigation
    // ========================================================

    const steps = ['shipping', 'payment', 'review'];
    let currentStep = 0;
    let selectedMethod = 'stripe';

    function goToStep(index) {
        steps.forEach((s, i) => {
            const section = document.getElementById('step-' + s);
            if (section) section.style.display = i === index ? 'block' : 'none';

            const ind = document.getElementById('step-ind-' + (i + 1));
            if (ind) {
                ind.classList.toggle('active', i === index);
                ind.classList.toggle('done', i < index);
            }
        });

        currentStep = index;
        hideCheckoutError();

        const placeBtn = document.getElementById('btn-place-order');
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Place Order';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========================================================
    // Step 1 → Step 2: validate address, then calculate tax
    // ========================================================

    const btnToPayment = document.getElementById('btn-to-payment');

    if (btnToPayment) {
        btnToPayment.addEventListener('click', async () => {
            const errEl = document.getElementById('shipping-error');
            if (errEl) errEl.style.display = 'none';

            const firstName = form.customer_first_name.value.trim();
            const lastName = form.customer_last_name.value.trim();
            const email = form.customer_email.value.trim();
            const address = form.shipping_address.value.trim();
            const city = form.shipping_city.value.trim();
            const state = form.shipping_state.value;
            const zip = form.shipping_zip.value.trim();

            if (!firstName || !lastName || !email || !address || !city || !state || !zip) {
                if (errEl) {
                    errEl.textContent = 'Please fill in all required fields.';
                    errEl.style.display = 'block';
                }
                return;
            }

            // Address validation logic from your existing checkout.
            const autoCompleted = window._addressAutoCompleted;
            const isHighConfidence = autoCompleted &&
                autoCompleted.hasStreetNumber &&
                autoCompleted.zip === zip &&
                String(autoCompleted.city || '').toLowerCase() === city.toLowerCase() &&
                autoCompleted.state === state;

            if (!isHighConfidence) {
                btnToPayment.disabled = true;
                btnToPayment.textContent = 'Validating address…';

                try {
                    const valRes = await fetch('/api/address/validate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address, city, state, zip }),
                    });
                    const valData = await valRes.json();

                    btnToPayment.disabled = false;
                    btnToPayment.textContent = 'Continue to Payment';

                    if (valData.corrected && !valData.cached && errEl) {
                        const c = valData.corrected;

                        errEl.innerHTML = `
                            <div style="margin-bottom:0.5rem;">📍 <strong>Did you mean:</strong></div>
                            <div style="margin-bottom:0.75rem; padding:0.5rem; background:#f9f6f2; border-radius:6px;">
                                ${escapeHTML(c.address)}<br>
                                ${escapeHTML(c.city)}, ${escapeHTML(c.state)} ${escapeHTML(c.zip)}
                            </div>
                            <div style="display:flex; gap:0.75rem;">
                                <button type="button" id="btn-accept-correction" class="btn btn-primary btn-sm">Use suggested address</button>
                                <button type="button" id="btn-keep-original" class="btn btn-outline btn-sm">Keep my address</button>
                            </div>
                        `;

                        errEl.style.display = 'block';
                        errEl.style.color = 'var(--color-text)';
                        errEl.style.background = '#fff8f0';
                        errEl.style.border = '1px solid #e0c9a6';
                        errEl.style.borderRadius = '8px';
                        errEl.style.padding = '1rem';

                        const acceptBtn = document.getElementById('btn-accept-correction');
                        const keepBtn = document.getElementById('btn-keep-original');

                        acceptBtn.addEventListener('click', async () => {
                            form.shipping_address.value = c.address;
                            form.shipping_city.value = c.city;

                            if (form.shipping_state.querySelector(`option[value="${c.state}"]`)) {
                                form.shipping_state.value = c.state;
                            }

                            form.shipping_zip.value = c.zip;
                            invalidateTaxQuote();

                            errEl.style.display = 'none';
                            errEl.style.cssText = '';

                            await continueToPaymentWithTax(errEl, acceptBtn);
                        });

                        keepBtn.addEventListener('click', async () => {
                            errEl.style.display = 'none';
                            errEl.style.cssText = '';
                            invalidateTaxQuote();
                            await continueToPaymentWithTax(errEl, keepBtn);
                        });

                        return;
                    }

                    if (!valData.valid && valData.confidence === 'low') {
                        // Preserve your original behavior: this validation is a
                        // warning rather than a hard block. Stripe Tax still gets
                        // the exact address the customer chose.
                        console.warn('Address validation returned low confidence.');
                    }
                } catch (err) {
                    // Address validation service unavailable — tax calculation
                    // can still validate whether Stripe accepts the destination.
                    btnToPayment.disabled = false;
                    btnToPayment.textContent = 'Continue to Payment';
                }
            }

            await continueToPaymentWithTax(errEl, btnToPayment);
        });
    }

    // ========================================================
    // Payment method toggle
    // ========================================================

    document.querySelectorAll('.payment-method input').forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.payment-method')
                .forEach(pm => pm.classList.remove('selected'));

            const wrapper = radio.closest('.payment-method');
            if (wrapper) wrapper.classList.add('selected');

            selectedMethod = radio.value;

            const isWallet =
                selectedMethod === 'google_pay' || selectedMethod === 'apple_pay';

            const stripeCardSection = document.getElementById('stripe-card-section');
            const walletSection = document.getElementById('wallet-section');

            if (stripeCardSection) {
                stripeCardSection.style.display = selectedMethod === 'stripe' ? '' : 'none';
            }
            if (walletSection) {
                walletSection.style.display = isWallet ? '' : 'none';
            }

            if (isWallet) {
                const unavailableMsg = document.getElementById('wallet-unavailable');
                const btnContainer = document.getElementById('wallet-payment-request-btn');

                if (!walletAvailable) {
                    if (unavailableMsg) unavailableMsg.style.display = '';
                    if (btnContainer) btnContainer.style.display = 'none';
                } else {
                    if (unavailableMsg) unavailableMsg.style.display = 'none';
                    if (btnContainer) btnContainer.style.display = '';
                }
            }
        });
    });

    // ========================================================
    // Step 2 → Step 3
    // ========================================================

    const btnToReview = document.getElementById('btn-to-review');

    if (btnToReview) {
        btnToReview.addEventListener('click', async () => {
            const errEl = document.getElementById('payment-error');
            if (errEl) errEl.style.display = 'none';

            const isWallet =
                selectedMethod === 'google_pay' || selectedMethod === 'apple_pay';

            if (selectedMethod === 'stripe' && !stripe) {
                if (errEl) {
                    errEl.textContent = 'Stripe is not available. Please select another payment method.';
                    errEl.style.display = 'block';
                }
                return;
            }

            if (isWallet && !walletAvailable) {
                if (errEl) {
                    errEl.textContent = 'This wallet is not available on your device. Please select another payment method.';
                    errEl.style.display = 'block';
                }
                return;
            }

            // Safety check: never review or pay with an address different from
            // the address used for the current tax quote.
            try {
                btnToReview.disabled = true;
                btnToReview.textContent = 'Updating total…';
                await ensureFreshTaxQuote();
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message || 'Unable to calculate sales tax.';
                    errEl.style.display = 'block';
                }
                return;
            } finally {
                btnToReview.disabled = false;
                btnToReview.textContent = 'Review Order';
            }

            const stateText =
                form.shipping_state.options[form.shipping_state.selectedIndex]?.text ||
                form.shipping_state.value;

            const reviewShipping = document.getElementById('review-shipping');
            if (reviewShipping) {
                reviewShipping.innerHTML = `
                    <p><strong>${escapeHTML(getCustomerName())}</strong></p>
                    <p>${escapeHTML(form.shipping_address.value)}${form.shipping_address2.value ? ', ' + escapeHTML(form.shipping_address2.value) : ''}</p>
                    <p>${escapeHTML(form.shipping_city.value)}, ${escapeHTML(stateText)} ${escapeHTML(form.shipping_zip.value)}</p>
                    <p>${escapeHTML(form.customer_email.value)}${form.customer_phone.value ? ' · ' + escapeHTML(form.customer_phone.value) : ''}</p>
                `;
            }

            const paymentLabels = {
                stripe: '<p>💳 Credit / Debit Card (Stripe)</p>',
                google_pay: '<p>🟢 Google Pay</p>',
                apple_pay: '<p>🍎 Apple Pay</p>',
            };

            const reviewPayment = document.getElementById('review-payment');
            if (reviewPayment) {
                reviewPayment.innerHTML = paymentLabels[selectedMethod] || '';
            }

            const stripePlaceOrder = document.getElementById('stripe-place-order');
            const walletPlaceOrder = document.getElementById('wallet-place-order');

            if (stripePlaceOrder) {
                stripePlaceOrder.style.display = selectedMethod === 'stripe' ? '' : 'none';
            }
            if (walletPlaceOrder) {
                walletPlaceOrder.style.display = isWallet ? '' : 'none';
            }

            goToStep(2);

            if (isWallet && paymentRequest && stripe) {
                paymentRequest.update({
                    total: {
                        label: 'Bakehouse Order',
                        amount: taxQuote.total,
                    },
                });

                await mountWalletButtonIfNeeded();
            }
        });
    }

    // ========================================================
    // Back buttons
    // ========================================================

    const backShipping = document.getElementById('btn-back-shipping');
    if (backShipping) backShipping.addEventListener('click', () => goToStep(0));

    const backPayment = document.getElementById('btn-back-payment');
    if (backPayment) backPayment.addEventListener('click', () => goToStep(1));

    const backWalletBtn = document.getElementById('btn-back-payment-wallet');
    if (backWalletBtn) backWalletBtn.addEventListener('click', () => goToStep(1));

    // ========================================================
    // Stripe card: Place Order
    // ========================================================

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedMethod !== 'stripe') return;

        const placeBtn = document.getElementById('btn-place-order');
        if (placeBtn) {
            placeBtn.disabled = true;
            placeBtn.textContent = 'Processing…';
        }

        hideCheckoutError();

        try {
            if (!stripe || !cardElement) {
                throw new Error('Stripe card payment is not available.');
            }

            // Create the PaymentIntent only when the customer is ready to pay.
            // The server verifies that the saved tax quote still matches the
            // exact cart and shipping destination.
            const intentData = await createPaymentIntent();

            const { error, paymentIntent } = await stripe.confirmCardPayment(
                intentData.clientSecret,
                {
                    payment_method: {
                        card: cardElement,
                    },
                }
            );

            if (error) {
                showCheckoutError(error.message);
                if (placeBtn) {
                    placeBtn.disabled = false;
                    placeBtn.textContent = 'Place Order';
                }
                return;
            }

            if (paymentIntent.status === 'succeeded') {
                await placeOrder('stripe', paymentIntent.id);
            } else {
                showCheckoutError('Payment was not completed. Please try again.');
                if (placeBtn) {
                    placeBtn.disabled = false;
                    placeBtn.textContent = 'Place Order';
                }
            }
        } catch (err) {
            showCheckoutError(err.message || 'Network error. Please check your connection and try again.');

            if (placeBtn) {
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
            }
        }
    });

    // ========================================================
    // Place order on backend after successful payment
    // ========================================================

    async function placeOrder(method, paymentId) {
        const data = {
            customer_name: getCustomerName(),
            customer_first_name: form.customer_first_name.value.trim(),
            customer_last_name: form.customer_last_name.value.trim(),
            customer_email: form.customer_email.value.trim(),
            customer_phone: form.customer_phone.value.trim(),
            shipping_address: form.shipping_address.value.trim(),
            shipping_address2: form.shipping_address2.value.trim(),
            shipping_city: form.shipping_city.value.trim(),
            shipping_state: form.shipping_state.value,
            shipping_zip: form.shipping_zip.value.trim(),
            payment_method: method,
            payment_id: paymentId,
            items: getCartPayload(),
        };

        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await res.json();

        if (!res.ok) {
            showCheckoutError(result.error || 'Failed to place order.');
            return;
        }

        Cart.clear();
        formWrapper.style.display = 'none';

        const confirmOrderId = document.getElementById('confirm-order-id');
        const confirmTotal = document.getElementById('confirm-total');

        if (confirmOrderId) confirmOrderId.textContent = result.order_id;
        if (confirmTotal) confirmTotal.textContent = parseFloat(result.total).toFixed(2);

        confirmation.style.display = 'block';

        if (!isLoggedIn) {
            const signup = document.getElementById('post-purchase-signup');
            if (signup) signup.style.display = '';
        }
    }

    // ========================================================
    // Post-purchase account creation
    // ========================================================

    const btnPostSignup = document.getElementById('btn-post-signup');
    const btnSkipSignup = document.getElementById('btn-skip-signup');

    if (btnPostSignup) {
        btnPostSignup.addEventListener('click', async () => {
            const errorDiv = document.getElementById('post-signup-error');
            if (errorDiv) errorDiv.style.display = 'none';

            const password = document.getElementById('post-signup-password').value;
            const confirm = document.getElementById('post-signup-confirm').value;

            if (!password || password.length < 8) {
                if (errorDiv) {
                    errorDiv.textContent = 'Password must be at least 8 characters.';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            if (password !== confirm) {
                if (errorDiv) {
                    errorDiv.textContent = 'Passwords do not match.';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            const email = form.customer_email.value.trim();
            const first_name = form.customer_first_name.value.trim();
            const last_name = form.customer_last_name.value.trim();
            const phone = form.customer_phone.value.trim();
            const shipping_address = form.shipping_address.value.trim();
            const shipping_address2 = form.shipping_address2.value.trim();
            const shipping_city = form.shipping_city.value.trim();
            const shipping_state = form.shipping_state.value;
            const shipping_zip = form.shipping_zip.value.trim();

            btnPostSignup.disabled = true;
            btnPostSignup.textContent = 'Creating…';

            try {
                const regRes = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        password,
                        first_name,
                        last_name,
                        phone,
                        shipping_address,
                        shipping_address2,
                        shipping_city,
                        shipping_state,
                        shipping_zip,
                    }),
                });

                const regData = await regRes.json();

                if (!regRes.ok) {
                    if (errorDiv) {
                        errorDiv.textContent = regData.error || 'Account creation failed.';
                        errorDiv.style.display = 'block';
                    }
                    btnPostSignup.disabled = false;
                    btnPostSignup.textContent = 'Create Account';
                    return;
                }

                const wrapper = document.getElementById('post-signup-form-wrapper');
                const success = document.getElementById('post-signup-success');
                if (wrapper) wrapper.style.display = 'none';
                if (success) success.style.display = '';
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = 'Something went wrong. Please try again.';
                    errorDiv.style.display = 'block';
                }
                btnPostSignup.disabled = false;
                btnPostSignup.textContent = 'Create Account';
            }
        });
    }

    if (btnSkipSignup) {
        btnSkipSignup.addEventListener('click', () => {
            const signup = document.getElementById('post-purchase-signup');
            if (signup) signup.style.display = 'none';
        });
    }

    // ========================================================
    // Error helpers
    // ========================================================

    function showCheckoutError(msg) {
        const el = document.getElementById('checkout-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
    }

    function hideCheckoutError() {
        const el = document.getElementById('checkout-error');
        if (el) el.style.display = 'none';
    }
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
