# InvoraLite User Manual

**Version 1.0.4**  
**Offline Inventory & Retail Management for Windows**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Dashboard](#4-dashboard)
5. [Products & Inventory](#5-products--inventory)
6. [Purchases](#6-purchases)
7. [Sales](#7-sales)
8. [Customers & Suppliers](#8-customers--suppliers)
9. [Invoices](#9-invoices)
10. [Sales & Purchase Returns](#10-sales--purchase-returns)
11. [Analytics](#11-analytics)
12. [Manage (Settings)](#12-manage-settings)
13. [Accounting & Tax Reports](#13-accounting--tax-reports)
14. [Backup & Restore](#14-backup--restore)
15. [Printing & Receipts](#15-printing--receipts)
16. [Frequently Asked Questions](#16-frequently-asked-questions)

---

## 1. Introduction

InvoraLite is a desktop application for retail and inventory businesses. It helps you manage stock, record sales and purchases, track customer credit, print invoices and receipts, and produce accounting reports for GST and tax filing—all **offline** on your Windows PC.

### Key benefits

- **Works offline** — no internet required for daily operations
- **Single system** — inventory, sales, people, and basic accounting in one place
- **Secure local storage** — encrypted SQLite vault on disk; data protected when the app is closed
- **Role-based access** — Admin, Store Keeper, Cashier, and Viewer roles with UI tailored to each role
- **Print-ready documents** — invoices, sale receipts, payment receipts, tax reports

### System requirements

- Windows 10 or 11 (64-bit)
- Microsoft WebView2 (included on most Windows 11 PCs)
- Screen resolution 1280×720 or higher recommended

---

## 2. Getting Started

### 2.1 Installation

1. Run the installer: `InvoraLite v.1.0.4 DD-MM-YYYY x64-setup.exe` (date varies by build)
2. Follow the setup wizard
3. Launch **InvoraLite** from the Start menu or desktop shortcut

### 2.2 License activation

On first launch, InvoraLite shows the **License** screen.

| Option | Description |
|--------|-------------|
| **Start 60-day trial** | Free trial bound to this computer |
| **Activate license** | Enter your `INVORA-` license key or import an activation file |

Contact your InvoraLite provider if you need a license key.

### 2.3 Business setup (first time only)

After licensing, complete **Business Setup**:

1. **Business name**, address, phone, email
2. **Licence number** and **TPN** (Tax Payer Number)
3. **GST registration** — enable if your business is GST-registered
4. **Owner account** — username and password for Admin login

Click **Complete Setup** to finish.

### 2.4 Sign in

1. Enter your **email/username** and **password**
2. Click **Sign In**

If credentials are wrong, InvoraLite shows a clear **Wrong credentials** message. After several failed attempts the account may be temporarily locked.

### 2.5 Sign out

Use **Logout** in the sidebar or profile menu. You will be asked to confirm before signing out.

The session also logs out automatically after **30 minutes** of inactivity.

---

## 3. User Roles & Permissions

InvoraLite shows a **role banner** after login explaining what your account can do. Buttons, tabs, and forms you cannot use are hidden or disabled.

| Role | Typical user | Can do | Cannot do |
|------|--------------|--------|-----------|
| **Admin** | Owner | Everything: settings, staff, accounting, encrypted backup, delete records | — |
| **Manager** | Shop manager | Products, purchases, sales, returns, staff/office/audit, delete | Business profile edit, tax report packs (Admin) |
| **Store Keeper** | Inventory staff | Products, purchases, purchase returns, stock adjustments, sales, customers, suppliers | Admin settings, delete records, backup |
| **Cashier** | Front desk | Sales, sales returns, customers, customer payments | Purchases, suppliers, admin settings |
| **Viewer** | Auditor, trainee | View dashboard, products, sales, invoices, customers, suppliers | Any save, edit, delete, or print that changes data |

### What each role sees

| Area | Admin | Manager | Store Keeper | Cashier | Viewer |
|------|-------|---------|--------------|---------|--------|
| Dashboard — New Sale | ✓ | ✓ | ✓ | ✓ | Hidden |
| Products — Inventory | Full | Full | Full | View only | View only |
| Products — Stock Adjustments | ✓ | ✓ | ✓ | Hidden | Hidden |
| Invoice — Sales Return | ✓ | ✓ | ✓ | ✓ | Hidden |
| Purchase / Purchase Return | ✓ | ✓ | ✓ | Hidden | Hidden |
| Customers tab | ✓ | ✓ | ✓ | ✓ | View only |
| Suppliers tab | ✓ | ✓ | ✓ | Hidden | View only |
| Manage — Business | Edit | View | View | View | View |
| Manage — Staff, Office, Audit | ✓ | ✓ | Limited | Hidden | Hidden |
| Profile — Backup / Restore | ✓ | Hidden | Hidden | Hidden | Hidden |

> **Tip:** Sensitive actions (void sale, delete records, restore backup) require your **password confirmation**.

Staff accounts are managed under **Manage → Manage Roles** (Admin only).

---

## 4. Dashboard

The **Dashboard** is your home screen after login.

### What you see

- **Today's sales** and revenue summary
- **Sales chart** — recent performance trend
- **Low-stock alerts** — products at or below alert level
- **Quick actions** — **New Sale** button (shown only if your role can record sales)

Use the sidebar to navigate to other modules.

---

## 5. Products & Inventory

Open **Products** from the sidebar.

Use the tabs at the top: **Inventory**, **Stock Adjustments** (Admin / Store Keeper only), and **Sale Returns**.

### 5.1 Inventory tab

Manage your product catalogue:

- **Add product** — name, category, SKU, price, cost, stock, optional IMEI/specification
- **Edit** — update details or pricing
- **Delete** — Admin only; requires password
- **Low stock alert** — set a per-product threshold; alerts appear on Dashboard and Products
- **Import / Export CSV** — bulk product data (Admin / Store Keeper only)

If you have **View only** access, you can browse the catalogue but cannot add, edit, or delete products.

The inventory table shows stock level, status (In stock / Low / Out), and selling price.

### 5.2 Stock Adjustments tab

*Available to Admin and Store Keeper only.*

Record stock changes that are not from sales or purchases:

| Reason | Use when |
|--------|----------|
| Stocktake | Physical count differs from system |
| Damage | Items damaged or written off |
| Theft | Stock lost or stolen |

Enter quantity change (+ or −), reason, and optional notes. Stock updates immediately and an audit entry is recorded.

### 5.3 Sale Returns tab (voided sales)

View **voided / cancelled sales** from Products. Voiding a sale:

- Restores product stock
- Reverses customer credit (if applicable)
- Marks the sale as cancelled

Void from the **Invoice** page (password required). This is different from a **Sales Return** (customer goods return) — see [§10](#10-sales--purchase-returns).

---

## 6. Purchases

Open **Purchase** from the sidebar (Admin, Manager, and Store Keeper). Cashiers and Viewers do not see this menu item.

If you open Purchase without permission, InvoraLite shows an **Access Restricted** message.

### Recording a purchase

1. Click **New Purchase**
2. Enter **invoice number**, **supplier**, and **purchase date**
3. Add line items — product name, quantity, cost, GST %, selling price (Rate Master items pull rates automatically)
4. Add **shipping charge** if applicable
5. Click **Save Purchase**

When saved as received and stocked, inventory quantities increase automatically. The purchase also appears in **Purchase History** (click a row for a read-only detail view).

### Supplier returns queue

If a customer return was marked **supplier-liable**, it appears at the top of Purchase as **Supplier returns queue**. Use **Create purchase return** to send goods back to the supplier (Stage 2). See [§10.2](#102-stage-2--purchase-return).

### Supplier linkage

Link purchases to suppliers from **Customers → Suppliers** for accurate payable tracking.

---

## 7. Sales

Start a sale from:

- **Dashboard** → New Sale
- **Products** page quick action

### 7.1 New Sale modal

1. **Select customer** — choose existing customer or Walk-in
2. **Add products** — search and add items; enter IMEI for phones if needed
3. **Apply offers / discount** (optional) — coupons, bill offers, payment offers, etc.
4. **Payment method:**

| Method | Description |
|--------|-------------|
| **Cash** | Full payment at sale |
| **E-Payment** | Bank transfer, mBoB, etc. — enter reference |
| **Credit** | Customer pays later — full amount on credit |
| **Credit + partial** | Part paid now, remainder on credit |

5. Complete the sale:

| Button | Action |
|--------|--------|
| **Complete Sale** | Saves sale only |
| **Complete Sale & Print Receipt** | Saves and opens receipt preview (80mm thermal format) |

Stock is reduced automatically when the sale completes.

### 7.2 Loyalty points

Named customers can earn and redeem **loyalty points**:

- **Earn** — on each completed sale (default 1 point per Nu 1.00 of total; configurable on a **LOYALTY** offer as “points per 100 Nu”)
- **Redeem** — on New Sale, when the customer has a balance, enter points to redeem (default Nu 1 per point; configurable on the LOYALTY offer)
- **Returns** — a sales return reverses a proportional share of points earned on that sale

Walk-in sales do not earn or redeem points. Balance is shown on **Customers**.

---

## 8. Customers & Suppliers

Open **Customers** from the sidebar.

**Cashiers** see the **Customers** tab only. **Viewers** can browse both tabs but cannot edit or record payments.

### 8.1 Customers tab

- Add customers with name, phone, address
- View **credit due** — amount owed by the customer
- View **loyalty points** balance when greater than zero
- **Mark Paid** — record payment against credit balance
- View **payment history** and reprint receipts

**Mark Paid** options:

- **Save Payment** — records payment
- **Save Payment & Print Payment Receipt** — records and opens A5 landscape receipt preview

Sales returns settled as **credit** reduce customer AR first, then add any remainder as store credit.

### 8.2 Suppliers tab

*Hidden from Cashier role.*

- Add suppliers with optional **opening balance** (credit or advance)
- Record **supplier payments**
- Track balance due and advance remaining
- View **payment history** — purchases, payments, advances, and **purchase returns** (debit notes)

---

## 9. Invoices

Open **Invoice** from the sidebar.

### Layout

- **Left panel** — Sales Record list (fixed width); select a sale
- **Right panel** — Tax invoice preview (shows prior returns on this sale when present)

### Actions

| Action | Description |
|--------|-------------|
| **Sales Return** | Customer goods return — stock in + settlement (see §10.1) |
| **Print** | Choose **Invoice** (tax invoice) or **Cash Memo** |
| **Void Sale** | Cancel entire sale, restore stock, reverse credit (password required) |

When GST is enabled, the invoice shows **Item | Qty | Price | GST | Total**, with selling price, GST, and grand total breakdown. Printed invoices use a professional A4 tax-invoice layout with business branding (logo/letterhead when configured).

Credit sales show payment status including settlements and outstanding balance.

---

## 10. Sales & Purchase Returns

InvoraLite uses a **two-stage** returns model. **Products** remain the stock source of truth. Original sales and purchases are **not** rewritten — returns are separate linked documents.

### 10.1 Stage 1 — Sales Return (customer)

1. Open **Invoice** and select the sale
2. Click **Sales Return**
3. Tick the lines to return and enter quantities (capped by what is still returnable)
4. Choose **reason** (warranty, complaint, damage, other)
5. Choose **customer settlement**:
   - **Refund** — cash/e-pay refund outside the AR ledger (no automatic balance change)
   - **Store credit / AR adjust** — reduces customer credit due; excess becomes store credit
   - **Replacement** — goods swapped; no AR change
6. Optionally tick **Supplier-liable** if you will return the item to the supplier next
7. Confirm — stock increases in Products and the return appears on the invoice preview

### 10.2 Stage 2 — Purchase Return (supplier)

Only for sales returns marked **supplier-liable** that are not yet sent:

1. Open **Purchase**
2. In **Supplier returns queue**, click **Create purchase return**
3. Select/enter the **supplier**, confirm **debit note / ref** and date
4. Confirm — stock decreases, supplier payable is reduced, and supplier payment history shows a **Return** row

The sales return status becomes **sent to supplier** and links to the purchase return ID.

> **Tip:** Use Stage 1 alone for customer-only returns (wrong size, change of mind). Use Stage 1 + Stage 2 for warranty / supplier-fault goods.

---

## 11. Analytics

Open **Analytics** from the sidebar.

View earnings charts:

- **Weekly**
- **Monthly**
- **Yearly**

Useful for tracking business performance over time.

---

## 12. Manage (Settings)

Open **Manage** from the bottom of the sidebar.

Non-Admin users can open Manage to **view** business details only. Admin-only tabs are not shown to other roles.

### 11.1 Business Profile

**Admin** can edit business name, address, TPN, GST registration, and owner password.

Other roles see the same fields **read-only** (fields are disabled).

### 11.2 Manage Roles (Admin)

Add, edit, or remove staff accounts and assign roles (Store Keeper, Cashier, or Viewer).

### 11.3 Office (Admin)

Track **office expenses** and **fixed assets**:

- Expenses by category (utilities, payroll, marketing, etc.)
- Asset register with depreciation support
- Print expense reports by period

### 11.4 Reports (Admin)

See [Section 12](#12-accounting--tax-reports).

### 11.5 Audit Log (Admin)

Browse system audit trail — logins, stock changes, sale voids, and other recorded actions. Use **Refresh** to update the list.

### 11.6 Software updates

Under **Manage → Software updates**:

1. The installed version is shown automatically
2. When a newer release is available, an **Update Available** banner appears
3. Click **Download & install** to update (desktop app only; requires internet)

Updates are downloaded from Software Host Releases.

### 11.7 Backup (Admin — header menu)

Access **Export Encrypted Backup** and **Restore Database** from the profile menu (top-right, Admin only).

---

## 13. Accounting & Tax Reports

**Manage → Reports** (Admin only)

Select an **accounting period** (month) at the top.

### Tabs

| Tab | Purpose |
|-----|---------|
| **Net Profit Dashboard** | Revenue, COGS, gross profit, net profit KPIs and trend |
| **P&L Report** | Full Profit & Loss statement for the period |
| **Chart of Accounts** | Standard account codes used by the system |
| **Journal Entries** | Auto-generated entries from sales, purchases, expenses + manual adjustments |
| **Monthly Closing** | Close the month and view closing history |

### Manual journal entry

For adjustments not captured in daily operations:

1. Go to **Journal Entries**
2. Enter description, **debit account**, **credit account**, and amount
3. Click **Post Entry**

Debits and credits always balance automatically.

### Tax submission report

Print a detailed report for GST and tax filing:

- **Monthly Closing** → **Print Tax Submission Report**
- **P&L Report** → **Print Tax Report**
- **Closing history** → **Print** on any closed period

The report includes:

- Business details (TPN, GST registration, licence)
- Profit & Loss statement
- GST output, input, and net payable
- Sales register and purchase register
- Operating expenses by category
- Declaration and signature lines

> **Note:** GST figures are estimated from your records. Review with your accountant before official submission.

### Monthly close

1. Review P&L and journal entries for the period
2. Go to **Monthly Closing**
3. Click **Close Month**

Once closed, no new manual journal entries can be added for that period.

---

## 14. Backup & Restore

InvoraLite protects your data in two ways:

1. **Database encryption at rest** — while the app is closed, your database is stored as an encrypted vault file
2. **Encrypted manual backups** — portable ZIP exports protected by a backup password you choose

### Export encrypted backup (Admin)

1. Click your **profile** (top-right)
2. Select **Export Encrypted Backup**
3. Enter a **backup password** (and confirm it) — store this password safely; it cannot be recovered if lost
4. Choose where to save the ZIP file

The backup contains your full encrypted database vault. You will need the **backup password** to restore this file on any computer.

### Restore backup (Admin)

1. Profile menu → **Restore Database**
2. Enter your **login password** to confirm
3. Select a backup ZIP file
4. If the backup is password-protected, enter the **backup password** when prompted
5. The app restarts with restored data

Older plain (unencrypted) backups from earlier versions can still be restored.

> **Warning:** Restore replaces all current data on this computer.

### Automatic backups

InvoraLite also keeps **automatic startup backups** (last 10) in the application data folder. These use machine-level encryption and can only be restored on the **same Windows user account** on the same PC.

### Data location

Application data folder: `%LOCALAPPDATA%\InvoraLite\`

| File | Description |
|------|-------------|
| `invora.db` | Live database while the app is running |
| `invora.db.vault` | Encrypted database when the app is closed |
| `.dbkey` | Encryption key (protected by Windows) |
| `backups\` | Automatic startup backup ZIP files |

---

## 15. Printing & Receipts

| Document | Format | How to print |
|----------|--------|--------------|
| Sale receipt | 80mm thermal | Complete Sale & Print Receipt |
| Tax invoice | Standard A4 | Invoice → Print → Invoice |
| Cash memo | Standard A4 | Invoice → Print → Cash Memo |
| Quotation estimation | Standard A4 | Pricing → Quotations → Print |
| Customer payment receipt | A5 landscape | Save Payment & Print Payment Receipt |
| Tax submission report | A4 portrait | Manage → Reports → Print Tax Report |
| Expense report | Standard | Manage → Office → Print |

Use your system's print dialog to select the correct printer and paper size.

Quotations can include products that are not yet in inventory (type a name and choose **Add as new product**). Converting a quotation to a sale creates missing products automatically when needed.

---

## 16. Frequently Asked Questions

### Does InvoraLite need internet?

No. Daily operations work fully offline. Internet is only needed for license activation if required by your provider.

### Can multiple users use it at once?

InvoraLite is designed for **single-store, single-computer** use. For multiple tills, install on each PC or use one shared workstation.

### What if I forget my password?

An Admin can reset staff passwords under **Manage → Manage Roles**. For the owner account, contact your InvoraLite support provider.

### Is my data encrypted?

Yes. When you **close** InvoraLite or **log out**, the database is sealed into an encrypted vault file. If the app was force-closed, the next launch refreshes the vault from the latest data before continuing. Manual backups you export are also password-encrypted. Keep your backup password in a safe place.

### What happens if I lose my backup password?

Encrypted manual backups cannot be restored without the backup password. Automatic machine backups on the same PC may still be available in the backups folder.

### How do loyalty points work?

Named customers earn points on completed sales and can redeem them as a discount on New Sale. Configure earn/redeem rates under **Pricing → Offers** with offer type **Loyalty**. Sales returns reverse a share of points earned on that sale.

### How do sales returns differ from voiding a sale?

**Void** cancels the entire sale (password required) and restores all stock. **Sales Return** is for goods brought back by the customer — you choose lines and quantities, settle the customer, and optionally send supplier-liable items onward as a purchase return. The original sale stays on record.

### How is customer credit tracked?

Credit sales add to the customer's balance. Payments recorded via **Mark Paid** reduce the balance. Payments apply to oldest credit invoices first (FIFO).

### Can I change data after month-end?

Closed accounting periods block new manual journal entries. Operational data (sales, purchases) should be corrected before closing, or adjusted via manual journal entries before close.

### Who do I contact for support?

Contact **EDP IT Department** or your InvoraLite license provider for activation, training, and technical support.

---

## Document Information

| Field | Value |
|-------|-------|
| Product | InvoraLite |
| Version | 1.0.0 |
| Manual date | 13 July 2026 |
| Platform | Windows (Tauri desktop) |
| Currency | Nu. (Bhutanese Ngultrum) |

*This manual describes InvoraLite v1.0.4. Features may be updated in future releases.*

---

**© InvoraLite — EDP IT Department**
