# Database Tables Overview

This document reflects the current tables in the active MySQL database.

## `address_book`
Saved shipping addresses tied to customer accounts.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key for address row. |
| `customer_id` | int | Customer owner of this address. |
| `label` | varchar(255) | Optional nickname (e.g., Home, Office). |
| `first_name` | varchar(100) | Recipient first name. |
| `last_name` | varchar(100) | Recipient last name. |
| `name` | varchar(255) | Full recipient name. |
| `phone` | varchar(50) | Recipient phone number. |
| `address` | text | Street line 1. |
| `address2` | text | Street line 2 / apartment / suite. |
| `city` | varchar(255) | City for shipping. |
| `state` | varchar(10) | State/region code. |
| `zip` | varchar(20) | Postal code. |
| `is_default` | tinyint(1) | Marks default address for customer. |
| `created_at` | timestamp | Creation timestamp. |

## `categories`
Product categories for the catalog.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key. |
| `name` | varchar(255) | Category name (unique). |
| `description` | text | Category description text. |

## `customers`
Customer identity + auth + profile data for website accounts.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key for customer account. |
| `email` | varchar(255) | Customer login email (unique). |
| `password_hash` | varchar(255) | Bcrypt-hashed password for local login. |
| `first_name` | varchar(100) | Customer first name. |
| `last_name` | varchar(100) | Customer last name. |
| `full_name` | varchar(255) | Display/full name. |
| `provider` | varchar(50) | Auth provider (`local`, `google`, `apple`, etc.). |
| `provider_id` | varchar(255) | Provider-specific subject/user ID. |
| `verified` | tinyint(1) | Email/account verification flag. |
| `verification_token` | varchar(255) | Token used during email verification flow. |
| `reset_token` | varchar(255) | Password reset token. |
| `reset_token_expires` | datetime | Password reset token expiry time. |
| `phone` | varchar(50) | Customer phone number. |
| `organization` | varchar(255) | Optional organization/company field. |
| `shipping_address` | text | Default shipping line 1. |
| `shipping_address2` | varchar(255) | Default shipping line 2. |
| `shipping_city` | varchar(255) | Default shipping city. |
| `shipping_state` | varchar(10) | Default shipping state. |
| `shipping_zip` | varchar(20) | Default shipping postal code. |
| `created_at` | timestamp | Record creation timestamp. |
| `updated_at` | timestamp | Last update timestamp. |
| `last_order_at` | datetime | Most recent order time by this customer. |

## `order_items`
Line items belonging to orders.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key. |
| `order_id` | int | Parent order reference. |
| `product_id` | int | Purchased product reference. |
| `quantity` | int | Quantity purchased. |
| `unit_price` | decimal(10,2) | Unit price charged at purchase time. |

## `orders`
Placed orders with payment, shipping, and totals.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key for order. |
| `customer_id` | int | Linked customer account. |
| `customer_name` | varchar(255) | Full customer name snapshot at order time. |
| `customer_first_name` | varchar(100) | First name snapshot at order time. |
| `customer_last_name` | varchar(100) | Last name snapshot at order time. |
| `customer_email` | varchar(255) | Email snapshot at order time. |
| `customer_phone` | varchar(50) | Phone snapshot at order time. |
| `shipping_address` | text | Shipping line 1 used for order. |
| `shipping_address2` | varchar(255) | Shipping line 2 used for order. |
| `shipping_city` | varchar(255) | Shipping city used for order. |
| `shipping_state` | varchar(2) | Shipping state used for order. |
| `shipping_zip` | varchar(20) | Shipping postal code used for order. |
| `subtotal` | decimal(10,2) | Pre-tax order subtotal. |
| `sales_tax` | decimal(10,2) | Sales tax amount charged. |
| `tax_calculation_id` | varchar(255) | Stripe Tax calculation reference. |
| `total` | decimal(10,2) | Final charged total. |
| `status` | varchar(50) | Fulfillment/order status. |
| `payment_method` | varchar(50) | Payment rail used (card/wallet type). |
| `payment_id` | varchar(255) | Stripe payment intent ID (idempotency key). |
| `tracking_number` | varchar(255) | Shipment tracking number. |
| `carrier` | varchar(255) | Shipping carrier name. |
| `created_at` | timestamp | Order creation timestamp. |

## `products`
Sellable catalog items.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key. |
| `name` | varchar(255) | Product name. |
| `description` | text | Product description. |
| `price` | decimal(10,2) | Current catalog price. |
| `image_url` | text | Image URL(s)/serialized image data reference. |
| `category_id` | int | Category reference. |
| `out_of_stock` | tinyint(1) | Stock availability flag. |
| `featured` | tinyint(1) | Featured/homepage flag. |
| `ingredients` | text | Ingredient details. |
| `nutritional_info` | text | Nutrition information text. |
| `created_at` | timestamp | Creation timestamp. |

## `sessions`
Session store used by `express-session`.

| Column | Type | Purpose |
|---|---|---|
| `sid` | varchar(255) | Session identifier (primary key). |
| `sess` | text | Serialized session payload. |
| `expired_at` | datetime | Session expiry timestamp. |

## `shipping_labels`
EasyPost-generated shipping label metadata and stored file path.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key. |
| `order_id` | int | Linked order ID. |
| `status` | varchar(20) | Label state (`not_created`, `creating`, `ready`, `failed`). |
| `easypost_shipment_id` | varchar(255) | EasyPost shipment ID. |
| `easypost_postage_label_id` | varchar(255) | EasyPost postage label ID. |
| `easypost_rate_id` | varchar(255) | Purchased EasyPost rate ID. |
| `carrier` | varchar(100) | Carrier selected by EasyPost buy step. |
| `service` | varchar(100) | Service level selected by EasyPost buy step. |
| `tracking_code` | varchar(255) | Shipment tracking code from EasyPost. |
| `label_url` | text | Original label URL returned by EasyPost. |
| `label_storage_path` | varchar(500) | Local stored PDF path key. |
| `label_format` | varchar(20) | Stored label format (e.g., `pdf`). |
| `error_message` | text | Failure detail when label creation fails. |
| `created_at` | timestamp | Creation timestamp. |
| `updated_at` | timestamp | Last update timestamp. |

## `users`
Enterprise/employee user identities (admin access control).

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key for enterprise user. |
| `email` | varchar(255) | Employee login email (unique). |
| `username` | varchar(100) | Employee username (unique); can be used for login. |
| `first_name` | varchar(100) | Employee first name. |
| `last_name` | varchar(100) | Employee last name. |
| `password_hash` | varchar(255) | Bcrypt-hashed password. |
| `verified` | tinyint(1) | Verification flag. |
| `reset_token` | varchar(255) | Password reset token. |
| `reset_token_expires` | datetime | Password reset token expiry. |
| `is_admin` | tinyint(1) | Admin authorization flag. |
| `phone` | varchar(50) | Employee phone. |
| `organization` | varchar(255) | Organization/company text. |
| `created_at` | timestamp | Creation timestamp. |

## `user_registration_requests`
Pending employee signups that require email verification and then admin approval.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key for signup request. |
| `email` | varchar(255) | Requested employee email (unique). |
| `username` | varchar(100) | Requested username (unique). |
| `first_name` | varchar(100) | Requested first name. |
| `last_name` | varchar(100) | Requested last name. |
| `password_hash` | varchar(255) | Bcrypt-hashed password captured at registration time. |
| `verification_token` | varchar(255) | Email verification token before verification is complete. |
| `email_verified_at` | datetime | Timestamp when email verification succeeded. |
| `status` | varchar(40) | Request state (`pending_verification`, `pending_admin_approval`, `approved`, `rejected`). |
| `approved_by_user_id` | int | Admin user ID that approved the request. |
| `approved_at` | datetime | Approval timestamp. |
| `rejected_at` | datetime | Rejection timestamp (if rejected). |
| `created_at` | timestamp | Request creation timestamp. |
| `updated_at` | timestamp | Last update timestamp. |

## `validated_addresses`
Cache of external address-validation responses.

| Column | Type | Purpose |
|---|---|---|
| `id` | int | Primary key. |
| `address_hash` | varchar(64) | Deterministic key for a raw address input. |
| `raw_address` | text | Input street line 1. |
| `raw_city` | varchar(255) | Input city. |
| `raw_state` | varchar(10) | Input state. |
| `raw_zip` | varchar(20) | Input postal code. |
| `validated_address` | text | Corrected/validated address line 1. |
| `validated_city` | varchar(255) | Corrected city. |
| `validated_state` | varchar(10) | Corrected state. |
| `validated_zip` | varchar(20) | Corrected postal code. |
| `provider` | varchar(50) | Validation provider source. |
| `confidence` | varchar(50) | Confidence level returned by provider. |
| `created_at` | timestamp | Cache insertion timestamp. |
