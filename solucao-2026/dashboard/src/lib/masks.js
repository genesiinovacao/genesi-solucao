// Máscaras de documento. O backend guarda só os dígitos — a formatação é
// apresentação, aplicada tanto na digitação quanto na exibição.

const digits = (v) => (v || '').replace(/\D/g, '');

/** 00.000.000/0000-00 — formata parcialmente enquanto digita. */
export function maskCnpj(value) {
  const d = digits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** 000.000.000-00 */
export function maskCpf(value) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF ou CNPJ conforme a quantidade de dígitos — o cliente final pode ser PJ. */
export const maskCpfCnpj = (value) =>
  digits(value).length > 11 ? maskCnpj(value) : maskCpf(value);

/** (00) 00000-0000 */
export function maskPhone(value) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Exibição: o banco guarda só dígitos, então a listagem precisa formatar.
 * Valor vazio vira travessão; tamanho inesperado é mostrado como veio.
 */
export function formatDoc(value) {
  const d = digits(value);
  if (!d) return '—';
  if (d.length === 14) return maskCnpj(d);
  if (d.length === 11) return maskCpf(d);
  return value;
}

export const onlyDigits = digits;
