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

    result.push([starsArray[i][0], starsArray[i][1], starsArray[i][2], median]);
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
    result.push([
      starsArray[i][0],
      starsArray[i][1],
      starsArray[i][2],
      loess[i][1],
    ]);
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

export {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  addPolynomial,
  calculatePercentile,
};
