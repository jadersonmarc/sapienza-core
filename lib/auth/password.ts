// Validação de força de senha (pura — testável).
export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "A senha deve ter ao menos 10 caracteres."
  if (!/[a-z]/.test(pw)) return "Inclua ao menos uma letra minúscula."
  if (!/[A-Z]/.test(pw)) return "Inclua ao menos uma letra maiúscula."
  if (!/[0-9]/.test(pw)) return "Inclua ao menos um número."
  return null
}
