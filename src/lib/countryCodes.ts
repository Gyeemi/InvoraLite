export interface CountryCode {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "+975", name: "Bhutan", flag: "🇧🇹" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "+86", name: "China", flag: "🇨🇳" },
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+81", name: "Japan", flag: "🇯🇵" },
  { code: "+60", name: "Malaysia", flag: "🇲🇾" },
  { code: "+977", name: "Nepal", flag: "🇳🇵" },
  { code: "+64", name: "New Zealand", flag: "🇳🇿" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+94", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "+82", name: "South Korea", flag: "🇰🇷" },
  { code: "+66", name: "Thailand", flag: "🇹🇭" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
];

export const DEFAULT_COUNTRY_CODE = "+975";

export function countryLabel(country: CountryCode): string {
  return `${country.name} (${country.code})`;
}
