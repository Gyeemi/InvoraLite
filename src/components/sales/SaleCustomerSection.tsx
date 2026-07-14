import { CountryCodeSelect } from "../CountryCodeSelect";
import {
  cardClass,
  formatContactLabel,
  inputClass,
  labelClass,
  phoneInnerInputClass,
  phoneInputGroupClass,
  phoneMaxLength,
  phonePlaceholder,
} from "../../lib/constants";
import { DEFAULT_COUNTRY_CODE } from "../../lib/countryCodes";
import { CustomerSearchSelect } from "./CustomerSearchSelect";
import type { NewSaleFormState } from "./useNewSaleForm";

export function SaleCustomerSection({ form }: { form: NewSaleFormState }) {
  const {
    customers,
    customerId,
    newCustomerName,
    newCustomerPhoneCountryCode,
    newCustomerPhone,
    newCustomerAddress,
    selectedCustomer,
    saleCustomerName,
    setCustomerId,
    setNewCustomerName,
    setNewCustomerPhoneCountryCode,
    setNewCustomerPhone,
    setNewCustomerAddress,
    clearCustomerSelection,
    formatPhoneLocal,
  } = form;

  return (
    <div>
      <label className={labelClass}>Customer</label>
      <CustomerSearchSelect
        id="customerName"
        customers={customers}
        customerId={customerId}
        newCustomerName={newCustomerName}
        onSelectCustomer={(customer) => {
          setCustomerId(customer.id);
          setNewCustomerName(null);
          setNewCustomerPhoneCountryCode(customer.countryCode || DEFAULT_COUNTRY_CODE);
          setNewCustomerPhone(
            customer.phone
              ? formatPhoneLocal(customer.countryCode || DEFAULT_COUNTRY_CODE, customer.phone)
              : "",
          );
          setNewCustomerAddress(customer.address || "");
        }}
        onAddNewCustomer={(name) => {
          setCustomerId("");
          setNewCustomerName(name);
          setNewCustomerPhone("");
          setNewCustomerAddress("");
          setNewCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
        }}
        onClearSelection={clearCustomerSelection}
      />

      {selectedCustomer && !newCustomerName && (
        <p className="mt-2 text-sm text-text-secondary">{formatContactLabel(selectedCustomer)}</p>
      )}

      {newCustomerName && (
        <div className={`${cardClass} mt-3 flex flex-wrap gap-3 p-5`}>
          <div className="min-w-[200px] flex-1">
            <label className={labelClass} htmlFor="newCustomerName">
              Name
            </label>
            <input
              id="newCustomerName"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Customer name"
              className={inputClass}
              required
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className={labelClass}>Phone number</label>
            <div className={phoneInputGroupClass}>
              <CountryCodeSelect
                value={newCustomerPhoneCountryCode}
                onChange={(code) => {
                  setNewCustomerPhoneCountryCode(code);
                  setNewCustomerPhone(formatPhoneLocal(code, newCustomerPhone));
                }}
              />
              <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
              <input
                value={newCustomerPhone}
                onChange={(e) =>
                  setNewCustomerPhone(formatPhoneLocal(newCustomerPhoneCountryCode, e.target.value))
                }
                placeholder={phonePlaceholder(newCustomerPhoneCountryCode)}
                inputMode="numeric"
                maxLength={phoneMaxLength(newCustomerPhoneCountryCode)}
                className={phoneInnerInputClass}
              />
            </div>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className={labelClass} htmlFor="newCustomerAddress">
              Address
            </label>
            <input
              id="newCustomerAddress"
              value={newCustomerAddress}
              onChange={(e) => setNewCustomerAddress(e.target.value)}
              placeholder="Billing address"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {!saleCustomerName && (
        <p className="mt-1.5 text-xs text-text-muted">Leave blank for walk-in customer</p>
      )}
    </div>
  );
}
