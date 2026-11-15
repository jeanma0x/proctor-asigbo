/** Política única de contraseñas (cliente y servidor). Devuelve el mensaje de error o null si es válida. */
export function passwordIssue(pw: string): string | null {
  if (pw.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (pw.length > 72) return "La contraseña no puede superar 72 caracteres.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return "Debe incluir mayúsculas, minúsculas y números.";
  return null;
}

/** Genera una contraseña aleatoria que cumple la política (sin caracteres ambiguos). */
export function generatePassword(length = 14): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const rnd = (max: number) => {
    const buf = new Uint32Array(1);
    // Rechazo de sesgo: descarta valores que romperían la uniformidad del módulo.
    const limit = Math.floor(0x100000000 / max) * max;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % max;
  };
  const chars = [lower[rnd(lower.length)], upper[rnd(upper.length)], digits[rnd(digits.length)]];
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
