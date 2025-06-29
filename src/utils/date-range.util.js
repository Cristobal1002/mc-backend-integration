export function getLocalDateRange(startDate, endDate, offsetHours = 5) {
    const offsetMs = offsetHours * 60 * 60 * 1000;

    const start = startDate
        ? new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + offsetMs)
        : new Date(Date.now() + offsetMs);
    start.setHours(0, 0, 0, 0);

    const end = endDate
        ? new Date(new Date(`${endDate}T23:59:59.999Z`).getTime() + offsetMs)
        : new Date(Date.now() + offsetMs);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}