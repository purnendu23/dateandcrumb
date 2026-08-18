/**
 * Phone number auto-format (XXX-XXX-XXXX)
 * Works on any page with a phone input field
 */
document.addEventListener('DOMContentLoaded', () => {
    // Support multiple possible phone field IDs
    const phoneInput = document.getElementById('customer_phone') || document.getElementById('phone');
    if (!phoneInput) return;

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

        // Adjust cursor position after inserting dashes
        const newLength = this.value.length;
        const diff = newLength - oldLength;
        this.setSelectionRange(cursorPos + diff, cursorPos + diff);
    });
});
