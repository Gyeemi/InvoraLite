# Offer Types Master Reference

Quick category map and definitions used by InvoraLite **Pricing → Offers** (Offer Master).

## Quick Category Map

| # | Offer Type | Trigger | Reward |
|---|------------|---------|--------|
| 1 | Discount Offer (Flat / %) | Buy item | Reduced price |
| 2 | Buy One Get One Free (BOGO / 1+1) | Buy same item | Same item free |
| 3 | Buy X Get Y Free (Combo/Cross) | Buy item A | Different item B free |
| 4 | Event / Seasonal Offer | Date range | Any of the above |
| 5 | Quantity / Slab (Bulk) Offer | Buy in quantity tiers | Tiered discount |
| 6 | Buy X Get Y at Discount | Buy item | Another item at reduced price |
| 7 | Flat Amount Off | Buy item / bill | Fixed amount deducted |
| 8 | Bill / Cart Value Offer | Total bill ≥ threshold | Discount or gift |
| 9 | Free Gift / Freebie on Purchase | Buy item / bill value | Free product |
| 10 | Combo / Bundle (Package) Offer | Buy grouped items | Fixed bundle price |
| 11 | Loyalty / Points Redemption | Member points | Discount / free item |
| 12 | Coupon / Voucher Code | Enter code | Discount / gift |
| 13 | Cashback Offer | Buy / pay | Amount returned later |
| 14 | Payment / Bank Offer | Pay via method | Instant discount / cashback |
| 15 | Clearance / Markdown Offer | Buy flagged item | Deep discount |
| 16 | Time-Bound (Flash / Happy Hours) | Buy within time window | Special price |
| 17 | Membership / Tier Price Offer | Customer group | Special price list |
| 18 | Mix & Match Offer | Buy any N from a group | Discount / free lowest |
| 19 | First Purchase / New Customer Offer | First transaction | Discount / gift |
| 20 | Referral Offer | Refer a customer | Discount / credit |

## Engine notes (InvoraLite)

- All offers share one **Offer Master** record with `offerType`.
- **Priority** then **best customer price** decide unit-price conflicts.
- **Stock**: free/gift units still reduce inventory when `deductStock` is true (BOGO charges stock for full qty).
- **Sales wiring today**: Discount, Flat Off, Clearance, Time-Bound, Slab, Membership (group), First Purchase (flag), BOGO paid-qty, Bill Value auto-discount.
- Other types are stored and editable in Offers UI for rollout of cart/gift/combo/coupon flows.

See `src/lib/offerTypes.ts` and `src/lib/productOffer.ts`.
