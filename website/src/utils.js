import * as d3 from "d3-regression";

const addRunningMedian = (starsArray, windowSize) => {
  const result = [];

  for (let i = 0; i < starsArray.length; i++) {
    const starWindow = [];

    for (let j = i - windowSize + 1; j <= i; j++) {
      if (j >= 0) {
        starWindow.push(starsArray[j][1]);
      }
    }

    starWindow.sort((a, b) => a - b);

    let median;
    const middle = Math.floor(starWindow.length / 2);

    if (starWindow.length % 2 === 0) {
      median = (starWindow[middle - 1] + starWindow[middle]) / 2;
    } else {
      median = starWindow[middle];
    }

    result.push([starsArray[i][0], median, starsArray[i][2]]);
  }

  return result;
};

const addRunningAverage = (starsArray, windowSize) => {
  const result = [];

  for (let i = 0; i < starsArray.length; i++) {
    const starWindow = [];

    const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
    const windowEnd = Math.min(
      starsArray.length - 1,
      i + Math.floor(windowSize / 2)
    );

    for (let j = windowStart; j <= windowEnd; j++) {
      starWindow.push(starsArray[j][1]);
    }

    const average =
      starWindow.reduce((sum, value) => sum + value, 0) / starWindow.length;

    result.push([starsArray[i][0], average, starsArray[i][2]]);
  }

  return result;
};

function addLOESS(starsArray, bandwidth) {
  const result = [];

  let loessData = [];
  for (let i = 0; i < starsArray.length; i++) {
    loessData.push([i, starsArray[i][1]]);
  }

  const loess = d3.regressionLoess().bandwidth(bandwidth)(loessData);

  for (let i = 0; i < starsArray.length; i++) {
    result.push([starsArray[i][0], loess[i][1], starsArray[i][2]]);
  }

  return result;
}

function addPolynomial(starsArray, order) {
  const result = [];

  let loessData = [];
  for (let i = 0; i < starsArray.length; i++) {
    loessData.push([i, starsArray[i][1]]);
  }

  const poly = d3.regressionPoly().order(order)(loessData);

  for (let i = 0; i < starsArray.length; i++) {
    result.push([
      starsArray[i][0],
      starsArray[i][1],
      starsArray[i][2],
      poly[i][1],
    ]);
  }

  return result;
}

const calculatePercentile = (arr, percentile) => {
  // Sort the array in ascending order
  arr.sort(function (a, b) {
    return a - b;
  });

  const n = arr.length;

  if (n === 0 || percentile < 0 || percentile > 1) {
    return undefined; // Invalid input
  }

  const index = (n - 1) * percentile;

  if (Number.isInteger(index)) {
    // If the index is an integer, return the element at that index
    return arr[index];
  } else {
    // If the index is a fraction, interpolate between the elements
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const lowerValue = arr[lowerIndex];
    const upperValue = arr[upperIndex];
    const fraction = index - lowerIndex;
    return lowerValue + fraction * (upperValue - lowerValue);
  }
};

const calculatePercentiles = (arr, percentile1, percentile2) => {
  if (
    arr.length === 0 ||
    percentile1 < 0 ||
    percentile1 > 1 ||
    percentile2 < 0 ||
    percentile2 > 1
  ) {
    return null;
  }

  // Sort the array
  const sortedArray = arr.slice().sort((a, b) => a - b);

  const max = sortedArray[sortedArray.length - 1];

  // Calculate indices for percentiles
  const index1 = (percentile1 * (sortedArray.length - 1)) | 0;
  const index2 = (percentile2 * (sortedArray.length - 1)) | 0;

  // Linear interpolation
  const value1 =
    sortedArray[index1] +
    (percentile1 - index1 / (sortedArray.length - 1)) *
    (sortedArray[index1 + 1] - sortedArray[index1]);
  const value2 =
    sortedArray[index2] +
    (percentile2 - index2 / (sortedArray.length - 1)) *
    (sortedArray[index2 + 1] - sortedArray[index2]);

  return [value1, value2, max];
};

const calculateFirstDerivative = (starsArray) => {
  const result = [];

  // Iterate through stars array, skipping the first element (no previous data point)
  for (let i = 1; i < starsArray.length; i++) {
    // Extract current and previous star values
    const currentStar = starsArray[i][1];
    const previousStar = starsArray[i - 1][1];

    // Calculate derivative using difference between current and previous values
    const derivative = currentStar - previousStar;

    // Include original timestamp and (optional) additional data
    result.push([starsArray[i][0], derivative, ...starsArray[i].slice(2)]); // Include data from index 2 onwards
  }

  return result;
};

const calculateSecondDerivative = (starsArray) => {
  const result = [];

  // Skip the first two elements (no second-order derivative for first two points)
  for (let i = 2; i < starsArray.length; i++) {
    // Extract current, previous, and second-previous star values
    const currentStar = starsArray[i][1];
    const previousStar = starsArray[i - 1][1];
    const secondPreviousStar = starsArray[i - 2][1];

    // Calculate second-order derivative (acceleration)
    const secondDerivative =
      currentStar - 2 * previousStar + secondPreviousStar;

    // Include original timestamp and (optional) additional data
    result.push([
      starsArray[i][0],
      secondDerivative,
      ...starsArray[i].slice(2),
    ]); // Include data from index 2 onwards
  }

  return result;
};

/**
 * Calculate week-on-week growth rate from daily star history.
 * Groups daily stars into ISO weeks, sums stars per week,
 * then computes the percentage growth rate between consecutive weeks.
 * Returns data in the same [date, value, totalStars] format used by other transformations,
 * where date is the Monday of each week (starting from the second week).
 */
const calculateWeeklyGrowthRate = (starsArray) => {
  if (!starsArray || starsArray.length < 14) return [];

  // Parse date string "DD-MM-YYYY" into a Date object
  const parseDate = (dateStr) => {
    const [d, m, y] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  // Get ISO week number and year for a date
  const getISOWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  };

  // Get Monday of the ISO week for a given date
  const getMondayOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  // Format date back to DD-MM-YYYY
  const formatDate = (date) => {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  };

  // Group by ISO week: { weekKey: { totalDaily, lastTotalStars, monday } }
  const weekMap = new Map();
  for (const entry of starsArray) {
    const date = parseDate(entry[0]);
    const weekKey = getISOWeek(date);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { totalDaily: 0, lastTotalStars: entry[2], monday: getMondayOfWeek(date) });
    }
    const week = weekMap.get(weekKey);
    week.totalDaily += entry[1];
    week.lastTotalStars = entry[2]; // keep the latest total for the week
  }

  const weeks = Array.from(weekMap.values());
  const result = [];

  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1].totalDaily;
    const curr = weeks[i].totalDaily;
    // Growth rate as percentage; if previous week had 0 stars, use 0
    const growthRate = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    result.push([formatDate(weeks[i].monday), parseFloat(growthRate.toFixed(2)), weeks[i].lastTotalStars]);
  }

  return result;
};

const formatNumber = (num) => {
  if (num < 1000) {
    return num.toString();
  } else if (num < 1_000_000) {
    return (num / 1000).toFixed(2) + 'k';
  } else {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
}

// Format number with locale-aware separators (e.g., 29,360 for US, 29.360 for Italy)
const formatNumberFull = (num) => {
  if (typeof num !== 'number' || isNaN(num)) return num;
  return num.toLocaleString();
}

export {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  addPolynomial,
  calculatePercentile,
  calculatePercentiles,
  calculateFirstDerivative,
  calculateSecondDerivative,
  calculateWeeklyGrowthRate,
  formatNumber,
  formatNumberFull,
};
