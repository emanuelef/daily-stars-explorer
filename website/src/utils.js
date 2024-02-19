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

    result.push([
      starsArray[i][0],
      starsArray[i][1],
      starsArray[i][2],
      average,
    ]);
  }

  return result;
};

export { addRunningMedian, addRunningAverage };
