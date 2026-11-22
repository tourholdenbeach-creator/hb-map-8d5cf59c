# Tour Holden Beach: advertising sales site

Live (unlisted, noindex): https://tourholdenbeach-creator.github.io/hb-map-8d5cf59c/advertise/

| Page | What it is |
|---|---|
| `advertise/` | Pitch, what you get, map preview, prices with Buy buttons, how it works, Host Partner + $99 drone interest form, FAQ, terms, contact |
| `advertise/preview/?id=<business id>` | "See your sample ad" page. Builds sample print and online ads in the browser from `data/businesses.geojson`. Linked from each unpaid pin popup next to Claim your listing. Realty Partner is shown only for realty and vacation-rental companies. |
| `advertise/claim/?biz=Name` | "Claim your listing" page. Shows the business name and preselects the name listing. `&plan=standard` preselects the standard ad. Also accepts the map's `?business=…&pin=…&id=…` |
| `advertise/checkout/?product=…&plan=…` | "Checkout coming soon" page, used while a product has no Stripe link. Builds a reservation email |
| `advertise/thanks/` | Page to send buyers to after Stripe payment: asks for logo, artwork and details by email |

## For the admin: prices and inventory

Everything is in **`data/products.json`**. Edit it on GitHub (open the file, click the pencil, Commit changes). The site updates within a few minutes.

- `prepaid_price`, `season_price`, `deposit`: prices in dollars. Set `deposit` to `null` to offer pay-in-full only.
- `total`: how many are for sale. `sold`: how many are sold. The page shows "X of Y available" and switches to "Sold out: join the waitlist" when `sold` reaches `total`.
- `includes`, `summary`, `inventory_note`: the text on each price card.
- `dates`: the deadlines shown under "How it works".
- `contact_email`: where all the email buttons go.

**After each sale:** add 1 to that product's `sold`. If Stripe link limits are on (below), also check the other link for the same product (prepaid and deposit share the same spaces).

## Premium Featured Listing (online, price TBD)

The `featured` product in `products.json` has `prepaid_price`/`season_price` set to `null`, so its card says "Pricing coming soon" with a "Tell me when it's available" email button. When Keith picks a price, set `prepaid_price` (and `season_price`, plus `deposit` if wanted; otherwise leave `deposit` null), create its Stripe Payment Link, and paste it into `featured.prepaid`. `total` is `null` (no inventory limit). For a print + featured bundle, either create a Stripe link with both items or sell the two separately.

## Connecting Stripe (one time, about 30 minutes)

The Buy buttons read **`data/payment-links.json`**. Any value that doesn't start with `https://` sends the buyer to the "checkout coming soon" page. Once you paste a real Stripe Payment Link, that button goes straight to Stripe.

1. Sign up or sign in at https://dashboard.stripe.com and finish account activation (business details and bank account for payouts). Stripe charges a fee per card payment.
2. **Products** (Product catalog > Add product). Create one product per row, each with a one-time price in USD:

   | Key in payment-links.json | Product name | Price |
   |---|---|---|
   | `standard.prepaid` | Standard ad space, paid in full (2027) | $695 |
   | `standard.deposit` | Standard ad space, 50% deposit (2027, season rate $750) | $375 |
   | `premium.prepaid` | Premium corner, paid in full (2027) | $1,390 |
   | `premium.deposit` | Premium corner, 50% deposit (2027, season rate $1,500) | $750 |
   | `half.prepaid` | Half space, paid in full (2027) | $348 |
   | `half.deposit` | Half space, 50% deposit (2027, season rate $375) | $187.50 |
   | `featured.prepaid` | Premium Featured Listing (2027, online) | Keith sets the price first (see below) |
   | `name.prepaid` | Name listing (2027) | $70 |
   | `realty.prepaid` | Realty Partner, paid in full (2027) | $1,390 |
   | `realty.deposit` | Realty Partner, 50% deposit (2027, season rate $1,500) | $750 |

   Deposit balances are invoiced later (Stripe Invoices) within 30 days or before press.
3. **Payment Links** (Payment Links > New). For each price above:
   - Quantity: fixed at 1 (don't let customers adjust quantity).
   - **Collect business details:** turn on "Collect customers' phone numbers" and add custom fields: `Business name` (text, required), `Website` (text, optional). Stripe allows up to 3 custom fields. Email is always collected.
   - **Limit the number of payments:** set it to the spaces left for that product (48 standard, 4 premium, 6 half, 30 name, 4 realty, minus any sold). Stripe has no shared inventory, so the prepaid and deposit links each get their own limit; keep `sold` in `products.json` current and lower the limits as spaces sell.
   - Optional: "Require customers to accept your terms of service" pointing to `…/advertise/#terms`.
   - **After payment:** choose "Don't show confirmation page, redirect customers to your website" and enter `https://tourholdenbeach-creator.github.io/hb-map-8d5cf59c/advertise/thanks/`.
   - Taxes: prices don't include tax. If tax applies, turn on Stripe Tax or add it to the price.
4. **Logo and artwork upload:** Stripe can't take file uploads. The thanks page asks buyers to email their logo, ad, photo and deal to tourholdenbeach@gmail.com. (A HubSpot form can replace that email later: change the thanks page button link.)
5. Copy each link (`https://buy.stripe.com/…`) into `data/payment-links.json` in place of `PASTE_STRIPE_PAYMENT_LINK`, commit, and wait a few minutes.
6. Test one link in Stripe test mode first, or buy a name listing and refund it.

When a buyer comes from the "Claim your listing" page, the site adds `?client_reference_id=Business-Name` to the Stripe link, so the payment shows which business it's for.

## Changing the map's claim button

The online map's "Claim your listing" buttons use `claimUrl` in `/js/config.js` (currently `advertise/claim/`). The map adds `?business=…&pin=…&id=…`.
