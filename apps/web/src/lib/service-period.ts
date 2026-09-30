const englishMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const germanMonths = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const monthAliases = new Map<string, number>();
englishMonths.forEach((month, index) => {
  monthAliases.set(month.toLowerCase(), index);
  monthAliases.set(month.slice(0, 3).toLowerCase(), index);
});
germanMonths.forEach((month, index) => monthAliases.set(month.toLowerCase(), index));
monthAliases.set("sept", 8);
monthAliases.set("maerz", 2);

const monthNames = Array.from(monthAliases.keys()).join("|");
const trailingPeriod = new RegExp(`\\b(${monthNames})(?:\\s+(\\d{4}))?\\s*$`, "iu");

export function getDescriptionServiceMonth(description: string) {
  const named = description.match(trailingPeriod);
  if (named) {
    return monthAliases.get(named[1].toLowerCase()) ?? null;
  }
  const numeric = description.match(/\b\d{4}-(0[1-9]|1[0-2])\s*$/);
  return numeric ? Number(numeric[1]) - 1 : null;
}

export function withServiceMonth(description: string, serviceMonth: string, issuedAt?: string) {
  const reference = issuedAt ? new Date(`${issuedAt}T12:00:00Z`) : new Date();
  const iso = serviceMonth.trim().match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  const named = serviceMonth.trim().match(/^([\p{L}]+)(?:\s+(\d{4}))?$/u);
  const index = iso
    ? Number(iso[2]) - 1
    : named
      ? monthAliases.get(named[1].toLowerCase())
      : undefined;
  if (index === undefined || Number.isNaN(reference.getTime())) {
    throw new Error("Provide a valid service month, for example 2026-09.");
  }
  let year = Number(iso?.[1] ?? named?.[2] ?? reference.getUTCFullYear());
  if (!iso && !named?.[2] && index > reference.getUTCMonth()) {
    year--;
  }
  const previous = description.match(trailingPeriod);
  const german =
    previous &&
    germanMonths.some(
      (month) =>
        month.toLowerCase() === previous[1].toLowerCase() &&
        !englishMonths.some((english) => english.toLowerCase() === month.toLowerCase()),
    );
  const label = `${(german ? germanMonths : englishMonths)[index]} ${year}`;
  if (previous) {
    return description.replace(trailingPeriod, label);
  }
  if (/\b\d{4}-(0[1-9]|1[0-2])\s*$/.test(description)) {
    return description.replace(/\b\d{4}-(0[1-9]|1[0-2])\s*$/, label);
  }
  return `${description.trim()} – ${label}`;
}

export function getServiceMonthFilenameLabel(month: number) {
  return englishMonths[month].toLowerCase();
}
