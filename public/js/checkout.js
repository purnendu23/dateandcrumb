/* Checkout page — multi-step: Shipping → Payment → Review → Place Order */

// ─── Phone number auto-format (XXX-XXX-XXXX) ────────────
document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('customer_phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            const cursorPos = this.selectionStart;
            const oldLength = this.value.length;
            let digits = this.value.replace(/\D/g, '').substring(0, 10);
            let formatted;
            if (digits.length > 6) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
            } else if (digits.length > 3) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3);
            } else {
                formatted = digits;
            }
            this.value = formatted;
            // Adjust cursor position
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

    if (items.length === 0) {
        formWrapper.innerHTML = `
            <div class="cart-empty">
                <p>Your cart is empty. Add items before checking out.</p>
                <a href="/products.html" class="btn btn-primary">Browse Products</a>
            </div>
        `;
        return;
    }

    // Render order summary
    checkoutItems.innerHTML = items.map(item => `
        <div class="checkout-item">
            <span>${escapeHTML(item.name)} &times; ${item.quantity}</span>
            <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
    checkoutTotal.textContent = Cart.getTotal().toFixed(2);

    // ─── "Use profile info" checkbox ─────────────────────
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
                document.getElementById('use-profile-wrapper').style.display = '';
            }
        }
    } catch (e) {
        // Not logged in or fetch failed — keep checkbox hidden
    }

    const useProfileCheckbox = document.getElementById('use-profile-info');
    const btnUseProfile = document.getElementById('btn-use-profile');
    if (btnUseProfile && profileData) {
        btnUseProfile.addEventListener('click', () => {
            form.customer_name.value = profileData.name || '';
            form.customer_email.value = profileData.email || '';
            form.customer_phone.value = profileData.phone || '';
            form.shipping_address.value = profileData.shipping_address || '';
            form.shipping_address2.value = profileData.shipping_address2 || '';
            form.shipping_city.value = profileData.shipping_city || '';
            form.shipping_state.value = profileData.shipping_state || '';
            form.shipping_zip.value = profileData.shipping_zip || '';
        });
    }

    // ─── Address Book ────────────────────────────────────
    const btnAddressBook = document.getElementById('btn-address-book');
    const addressBookModal = document.getElementById('address-book-modal');
    const closeAddressBook = document.getElementById('close-address-book');

    if (btnAddressBook) {
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
                        <div style="font-weight:600;">${escapeHTML(addr.name || '')}</div>
                        <div>${escapeHTML(addr.address)}${addr.address2 ? ', ' + escapeHTML(addr.address2) : ''}</div>
                        <div>${escapeHTML(addr.city)}${addr.state ? ', ' + escapeHTML(addr.state) : ''} ${escapeHTML(addr.zip)}</div>
                        ${addr.phone ? `<div style="color:var(--color-text-light); font-size:0.9rem;">${escapeHTML(addr.phone)}</div>` : ''}
                    </div>
                `).join('');

                // Click to select an address
                listEl.querySelectorAll('.address-book-entry').forEach((entry) => {
                    entry.addEventListener('click', () => {
                        const idx = parseInt(entry.dataset.index, 10);
                        const addr = data.addresses[idx];
                        form.customer_name.value = addr.name || '';
                        form.customer_phone.value = addr.phone || '';
                        form.shipping_address.value = addr.address || '';
                        form.shipping_address2.value = addr.address2 || '';
                        form.shipping_city.value = addr.city || '';
                        form.shipping_state.value = addr.state || '';
                        form.shipping_zip.value = addr.zip || '';
                        // Keep email from profile
                        if (profileData && !form.customer_email.value) {
                            form.customer_email.value = profileData.email || '';
                        }
                        if (useProfileCheckbox) useProfileCheckbox.checked = false;
                        addressBookModal.style.display = 'none';
                    });
                    entry.addEventListener('mouseover', () => { entry.style.background = '#f5f0eb'; });
                    entry.addEventListener('mouseout', () => { entry.style.background = '#fff'; });
                });
            } catch (err) {
                listEl.innerHTML = '<p style="color:var(--color-error);">Failed to load addresses.</p>';
            }
        });
    }

    if (closeAddressBook) {
        closeAddressBook.addEventListener('click', () => {
            addressBookModal.style.display = 'none';
        });
    }
    if (addressBookModal) {
        addressBookModal.addEventListener('click', (e) => {
            if (e.target === addressBookModal) addressBookModal.style.display = 'none';
        });
    }

    // ─── Fetch payment config ────────────────────────────
    let stripePublicKey = null;
    let stripe = null;

    try {
        const configRes = await fetch('/api/payments/config');
        const config = await configRes.json();
        stripePublicKey = config.stripePublicKey;
    } catch (e) {
        console.error('Failed to load payment config:', e);
    }

    // ─── Initialize Stripe (but don't mount yet — step 2 is hidden) ──
    let stripeElements = null;
    let cardMounted = false;
    if (stripePublicKey && window.Stripe) {
        stripe = Stripe(stripePublicKey);
        stripeElements = stripe.elements();
    } else {
        document.getElementById('stripe-card-number').innerHTML =
            '<p style="color:#c00;">Stripe is not configured. Card payments are unavailable.</p>';
    }

    let cardElement = null;

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

        // Use a single combined card element (number + expiry + cvc in one)
        cardElement = stripeElements.create('card', { style: elementStyle, disableLink: true, hidePostalCode: true });

        // Mount into the card-number container; hide the separate expiry/cvc containers
        document.getElementById('stripe-card-number').innerHTML = '';
        cardElement.mount('#stripe-card-number');

        // Hide the separate expiry and cvc fields since 'card' element includes them
        const expiryGroup = document.getElementById('stripe-card-expiry').closest('.form-group');
        const cvcGroup = document.getElementById('stripe-card-cvc').closest('.form-group');
        if (expiryGroup) expiryGroup.style.display = 'none';
        if (cvcGroup) cvcGroup.style.display = 'none';
        // Also hide the form-row parent if both children are hidden
        const formRow = expiryGroup?.parentElement;
        if (formRow && formRow.classList.contains('form-row')) formRow.style.display = 'none';

        const errEl = document.getElementById('stripe-card-errors');
        cardElement.on('change', (event) => {
            errEl.textContent = event.error ? event.error.message : '';
        });

        cardMounted = true;
    }

    // ─── Setup Stripe Payment Request (Google Pay / Apple Pay) ─────
    let paymentRequest = null;
    let walletAvailable = false;

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

        // Check if Google Pay or Apple Pay is available
        paymentRequest.canMakePayment().then(result => {
            walletAvailable = !!result;
            if (!result) {
                // Hide wallet options if neither is available
                const gpayOpt = document.querySelector('[data-method="google_pay"]');
                const apayOpt = document.querySelector('[data-method="apple_pay"]');
                if (gpayOpt) gpayOpt.style.display = 'none';
                if (apayOpt) apayOpt.style.display = 'none';
            } else {
                // Show only available wallets
                if (!result.googlePay) {
                    const gpayOpt = document.querySelector('[data-method="google_pay"]');
                    if (gpayOpt) gpayOpt.style.display = 'none';
                }
                if (!result.applePay) {
                    const apayOpt = document.querySelector('[data-method="apple_pay"]');
                    if (apayOpt) apayOpt.style.display = 'none';
                }
            }
        });
    } else {
        // Stripe not configured — hide wallet options
        const gpayOpt = document.querySelector('[data-method="google_pay"]');
        const apayOpt = document.querySelector('[data-method="apple_pay"]');
        if (gpayOpt) gpayOpt.style.display = 'none';
        if (apayOpt) apayOpt.style.display = 'none';
    }

    // ─── Step navigation ─────────────────────────────────
    const steps = ['shipping', 'payment', 'review'];
    let currentStep = 0;
    let selectedMethod = 'stripe';

    function goToStep(index) {
        steps.forEach((s, i) => {
            document.getElementById('step-' + s).style.display = i === index ? 'block' : 'none';
            const ind = document.getElementById('step-ind-' + (i + 1));
            ind.classList.toggle('active', i === index);
            ind.classList.toggle('done', i < index);
        });
        currentStep = index;

        // Reset error messages and button state on every step change
        hideCheckoutError();
        const placeBtn = document.getElementById('btn-place-order');
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Place Order';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Step 1 → Step 2
    document.getElementById('btn-to-payment').addEventListener('click', async () => {
        const errEl = document.getElementById('shipping-error');
        errEl.style.display = 'none';

        const name = form.customer_name.value.trim();
        const email = form.customer_email.value.trim();
        const address = form.shipping_address.value.trim();
        const city = form.shipping_city.value.trim();
        const state = form.shipping_state.value;
        const zip = form.shipping_zip.value.trim();

        if (!name || !email || !address || !city || !state || !zip) {
            errEl.textContent = 'Please fill in all required fields.';
            errEl.style.display = 'block';
            return;
        }

        // ─── Address validation logic ────────────────────
        const autoCompleted = window._addressAutoCompleted;
        const isHighConfidence = autoCompleted &&
            autoCompleted.hasStreetNumber &&
            autoCompleted.zip === zip &&
            autoCompleted.city.toLowerCase() === city.toLowerCase() &&
            autoCompleted.state === state;

        if (!isHighConfidence) {
            // Validate via server API
            const btnPayment = document.getElementById('btn-to-payment');
            btnPayment.disabled = true;
            btnPayment.textContent = 'Validating address…';

            try {
                const valRes = await fetch('/api/address/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address, city, state, zip }),
                });
                const valData = await valRes.json();

                btnPayment.disabled = false;
                btnPayment.textContent = 'Continue to Payment';

                if (valData.corrected && !valData.cached) {
                    // Show "Did you mean?" suggestion
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

                    document.getElementById('btn-accept-correction').addEventListener('click', () => {
                        form.shipping_address.value = c.address;
                        form.shipping_city.value = c.city;
                        if (form.shipping_state.querySelector(`option[value="${c.state}"]`)) {
                            form.shipping_state.value = c.state;
                        }
                        form.shipping_zip.value = c.zip;
                        errEl.style.display = 'none';
                        errEl.style.cssText = '';
                        goToStep(1);
                        mountStripeCard();
                    });

                    document.getElementById('btn-keep-original').addEventListener('click', () => {
                        errEl.style.display = 'none';
                        errEl.style.cssText = '';
                        goToStep(1);
                        mountStripeCard();
                    });

                    return;
                }

                if (!valData.valid && valData.confidence === 'low') {
                    errEl.textContent = 'We could not verify this address. Please double-check it before continuing.';
                    errEl.style.display = 'block';
                    // Still allow proceeding — just a warning. They already confirmed fields.
                }
            } catch (err) {
                // Validation service unavailable — proceed anyway
                btnPayment.disabled = false;
                btnPayment.textContent = 'Continue to Payment';
            }
        }

        goToStep(1);

        // Mount Stripe card element now that step 2 is visible
        mountStripeCard();
    });

    // Payment method toggle
    document.querySelectorAll('.payment-method input').forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.payment-method').forEach(pm => pm.classList.remove('selected'));
            radio.closest('.payment-method').classList.add('selected');
            selectedMethod = radio.value;

            const isWallet = selectedMethod === 'google_pay' || selectedMethod === 'apple_pay';
            document.getElementById('stripe-card-section').style.display = selectedMethod === 'stripe' ? '' : 'none';
            document.getElementById('wallet-section').style.display = isWallet ? '' : 'none';

            // Show wallet availability message
            if (isWallet) {
                const unavailableMsg = document.getElementById('wallet-unavailable');
                const btnContainer = document.getElementById('wallet-payment-request-btn');
                if (!walletAvailable) {
                    unavailableMsg.style.display = '';
                    btnContainer.style.display = 'none';
                } else {
                    unavailableMsg.style.display = 'none';
                    btnContainer.style.display = '';
                }
            }
        });
    });

    // Step 2 → Step 3
    document.getElementById('btn-to-review').addEventListener('click', async () => {
        const errEl = document.getElementById('payment-error');
        errEl.style.display = 'none';

        const isWallet = selectedMethod === 'google_pay' || selectedMethod === 'apple_pay';

        if (selectedMethod === 'stripe' && !stripe) {
            errEl.textContent = 'Stripe is not available. Please select another payment method.';
            errEl.style.display = 'block';
            return;
        }

        if (isWallet && !walletAvailable) {
            errEl.textContent = 'This wallet is not available on your device. Please select another payment method.';
            errEl.style.display = 'block';
            return;
        }

        // Populate review — shipping
        const stateText = form.shipping_state.options[form.shipping_state.selectedIndex].text;
        document.getElementById('review-shipping').innerHTML = `
            <p><strong>${escapeHTML(form.customer_name.value)}</strong></p>
            <p>${escapeHTML(form.shipping_address.value)}${form.shipping_address2.value ? ', ' + escapeHTML(form.shipping_address2.value) : ''}</p>
            <p>${escapeHTML(form.shipping_city.value)}, ${escapeHTML(stateText)} ${escapeHTML(form.shipping_zip.value)}</p>
            <p>${escapeHTML(form.customer_email.value)}${form.customer_phone.value ? ' · ' + escapeHTML(form.customer_phone.value) : ''}</p>
        `;

        // Populate review — payment
        const paymentLabels = {
            stripe: '<p>💳 Credit / Debit Card (Stripe)</p>',
            google_pay: '<p>🟢 Google Pay</p>',
            apple_pay: '<p>🍎 Apple Pay</p>',
        };
        document.getElementById('review-payment').innerHTML = paymentLabels[selectedMethod] || '';

        // Show the right place-order section
        document.getElementById('stripe-place-order').style.display = selectedMethod === 'stripe' ? '' : 'none';
        document.getElementById('wallet-place-order').style.display = isWallet ? '' : 'none';

        goToStep(2);

        // Mount Stripe Payment Request Button for wallet payments on step 3
        if (isWallet && paymentRequest && stripe) {
            const container = document.getElementById('wallet-place-order-btn');
            container.innerHTML = '';

            // Update the payment request amount
            paymentRequest.update({
                total: {
                    label: 'Bakehouse Order',
                    amount: Math.round(Cart.getTotal() * 100),
                },
            });

            const prButton = stripeElements.create('paymentRequestButton', {
                paymentRequest: paymentRequest,
            });
            prButton.mount('#wallet-place-order-btn');

            // Handle payment method from wallet
            paymentRequest.on('paymentmethod', async (ev) => {
                try {
                    // Create PaymentIntent on server
                    const intentRes = await fetch('/api/payments/stripe/create-intent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })) }),
                    });
                    const intentData = await intentRes.json();
                    if (!intentRes.ok) {
                        ev.complete('fail');
                        showCheckoutError(intentData.error || 'Failed to initialize payment.');
                        return;
                    }

                    // Confirm the payment with the wallet payment method
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

                    if (paymentIntent.status === 'requires_action') {
                        const { error: actionError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(intentData.clientSecret);
                        if (actionError) {
                            showCheckoutError(actionError.message);
                            return;
                        }
                        await placeOrder(selectedMethod, confirmedIntent.id);
                    } else if (paymentIntent.status === 'succeeded') {
                        await placeOrder(selectedMethod, paymentIntent.id);
                    } else {
                        showCheckoutError('Payment was not completed. Please try again.');
                    }
                } catch (err) {
                    ev.complete('fail');
                    showCheckoutError('Network error. Please check your connection and try again.');
                }
            });
        }
    });

    // Back buttons
    document.getElementById('btn-back-shipping').addEventListener('click', () => goToStep(0));
    document.getElementById('btn-back-payment').addEventListener('click', () => goToStep(1));
    const backWalletBtn = document.getElementById('btn-back-payment-wallet');
    if (backWalletBtn) backWalletBtn.addEventListener('click', () => goToStep(1));

    // ─── Stripe: Place Order (form submit) ───────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedMethod !== 'stripe') return;

        const placeBtn = document.getElementById('btn-place-order');
        placeBtn.disabled = true;
        placeBtn.textContent = 'Processing…';
        hideCheckoutError();

        try {
            // 1. Create PaymentIntent on server
            const intentRes = await fetch('/api/payments/stripe/create-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })) }),
            });
            const intentData = await intentRes.json();
            if (!intentRes.ok) {
                showCheckoutError(intentData.error || 'Failed to initialize payment.');
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
                return;
            }

            // 2. Confirm payment with Stripe.js
            const { error, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
                payment_method: { card: cardElement },
            });

            if (error) {
                showCheckoutError(error.message);
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
                return;
            }

            if (paymentIntent.status === 'succeeded') {
                // 3. Place the order on the backend
                await placeOrder('stripe', paymentIntent.id);
            } else {
                showCheckoutError('Payment was not completed. Please try again.');
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
            }
        } catch (err) {
            showCheckoutError('Network error. Please check your connection and try again.');
            placeBtn.disabled = false;
            placeBtn.textContent = 'Place Order';
        }
    });

    // ─── Place order on backend after payment ────────────
    async function placeOrder(method, paymentId) {
        const data = {
            customer_name: form.customer_name.value.trim(),
            customer_email: form.customer_email.value.trim(),
            customer_phone: form.customer_phone.value.trim(),
            shipping_address: form.shipping_address.value.trim(),
            shipping_address2: form.shipping_address2.value.trim(),
            shipping_city: form.shipping_city.value.trim(),
            shipping_state: form.shipping_state.value,
            shipping_zip: form.shipping_zip.value.trim(),
            payment_method: method,
            payment_id: paymentId,
            items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
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
        document.getElementById('confirm-order-id').textContent = result.order_id;
        document.getElementById('confirm-total').textContent = parseFloat(result.total).toFixed(2);
        confirmation.style.display = 'block';

        // Show post-purchase signup for guests
        if (!isLoggedIn) {
            document.getElementById('post-purchase-signup').style.display = '';
        }
    }

    // ─── Post-purchase account creation ───────────────────
    const btnPostSignup = document.getElementById('btn-post-signup');
    const btnSkipSignup = document.getElementById('btn-skip-signup');

    if (btnPostSignup) {
        btnPostSignup.addEventListener('click', async () => {
            const errorDiv = document.getElementById('post-signup-error');
            errorDiv.style.display = 'none';

            const password = document.getElementById('post-signup-password').value;
            const confirm = document.getElementById('post-signup-confirm').value;

            if (!password || password.length < 8) {
                errorDiv.textContent = 'Password must be at least 8 characters.';
                errorDiv.style.display = 'block';
                return;
            }
            if (password !== confirm) {
                errorDiv.textContent = 'Passwords do not match.';
                errorDiv.style.display = 'block';
                return;
            }

            // Use the shipping info they already entered
            const email = form.customer_email.value.trim();
            const name = form.customer_name.value.trim();
            const phone = form.customer_phone.value.trim();
            const shipping_address = form.shipping_address.value.trim();
            const shipping_address2 = form.shipping_address2.value.trim();
            const shipping_city = form.shipping_city.value.trim();
            const shipping_state = form.shipping_state.value;
            const shipping_zip = form.shipping_zip.value.trim();

            btnPostSignup.disabled = true;
            btnPostSignup.textContent = 'Creating…';

            try {
                // 1. Register the account with shipping info
                const regRes = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email, password, name, phone,
                        shipping_address, shipping_address2,
                        shipping_city, shipping_state, shipping_zip,
                    }),
                });
                const regData = await regRes.json();

                if (!regRes.ok) {
                    errorDiv.textContent = regData.error || 'Account creation failed.';
                    errorDiv.style.display = 'block';
                    btnPostSignup.disabled = false;
                    btnPostSignup.textContent = 'Create Account';
                    return;
                }

                // Show success
                document.getElementById('post-signup-form-wrapper').style.display = 'none';
                document.getElementById('post-signup-success').style.display = '';

            } catch (err) {
                errorDiv.textContent = 'Something went wrong. Please try again.';
                errorDiv.style.display = 'block';
                btnPostSignup.disabled = false;
                btnPostSignup.textContent = 'Create Account';
            }
        });
    }

    if (btnSkipSignup) {
        btnSkipSignup.addEventListener('click', () => {
            document.getElementById('post-purchase-signup').style.display = 'none';
        });
    }

    function showCheckoutError(msg) {
        const el = document.getElementById('checkout-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function hideCheckoutError() {
        document.getElementById('checkout-error').style.display = 'none';
    }

});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
