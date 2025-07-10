// Parses strings like '5m', '2 hours', '1d', etc.
module.exports = function parseDuration(str) {
  if (!str) return null;
  const units = {
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,

    m: 60_000,
    min: 60_000,
    minute: 60_000,
    minutes: 60_000,

    h: 3600_000,
    hr: 3600_000,
    hour: 3600_000,
    hours: 3600_000,

    d: 86400_000,
    day: 86400_000,
    days: 86400_000,

    mo: 2_592_000_000,
    month: 2_592_000_000,
    months: 2_592_000_000,
  };

  const match = str.toLowerCase().match(/(\d+)\s*(\w+)/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];

  const multiplier = units[unit];
  return multiplier ? value * multiplier : null;
};
