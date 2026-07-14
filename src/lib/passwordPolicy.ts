export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordComplexity(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasLetter && hasDigit;
}

export function passwordComplexityMessage(): string {
  return `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include at least one letter and one number.`;
}

export function canUsePassword(password: string, isExistingHash: boolean): boolean {
  if (isExistingHash) return true;
  return validatePasswordComplexity(password);
}
