/**
 * Date helper wrappers around date-fns.
 */
const {
  differenceInCalendarDays,
  format,
  isBefore,
  parseISO,
  startOfToday,
  subDays
} = require("date-fns");

/**
 * Checks whether a due date is strictly before today.
 * @param {string} dueDateStr - ISO date string.
 * @returns {boolean} True when overdue.
 */
function isOverdue(dueDateStr) {
  return isBefore(parseISO(dueDateStr), startOfToday());
}

/**
 * Returns how many calendar days a due date is overdue.
 * @param {string} dueDateStr - ISO date string.
 * @returns {number} Overdue day count, or 0.
 */
function daysPastDue(dueDateStr) {
  if (!isOverdue(dueDateStr)) {
    return 0;
  }

  return differenceInCalendarDays(startOfToday(), parseISO(dueDateStr));
}

/**
 * Returns how many calendar days remain until a future date.
 * @param {string} futureDateStr - ISO date string.
 * @returns {number} Day difference from today.
 */
function daysUntil(futureDateStr) {
  return differenceInCalendarDays(parseISO(futureDateStr), startOfToday());
}

/**
 * Returns a date range covering the last N days through today.
 * @param {number} days - Number of days in the range.
 * @returns {{from: Date, to: Date}} Inclusive date range object.
 */
function getDateRange(days) {
  const to = startOfToday();
  const from = subDays(to, days);

  return { from, to };
}

/**
 * Formats a date for terminal display.
 * @param {string} dateStr - ISO date string.
 * @returns {string} Formatted date label.
 */
function formatForDisplay(dateStr) {
  return format(parseISO(dateStr), "dd MMM yyyy");
}

/**
 * Returns the current ISO week label.
 * @returns {string} Current week label.
 */
function getCurrentWeekLabel() {
  return format(startOfToday(), "RRRR-'W'II");
}

module.exports = {
  isOverdue,
  daysPastDue,
  daysUntil,
  getDateRange,
  formatForDisplay,
  getCurrentWeekLabel
};
