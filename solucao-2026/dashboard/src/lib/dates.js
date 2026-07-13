// Dias de calendário entre hoje e uma data ISO (YYYY-MM-DD).
// 0 = hoje, 1 = amanhã, negativo = já passou.
// Compara meia-noite local com meia-noite local: o resultado não muda
// conforme a hora do dia (era a causa do "expira em 3 dias" para depois
// de amanhã) nem sofre o deslocamento de fuso do new Date('YYYY-MM-DD'),
// que interpreta a string como UTC.
export const daysUntil = (iso) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`) - today) / 86400000);
};
