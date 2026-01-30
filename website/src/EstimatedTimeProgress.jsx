import React, { useState, useEffect } from "react";
import { LinearProgress, Typography, Box } from "@mui/material";

const EstimatedTimeProgress = ({ text, totalTime }) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    setElapsedTime(0);
  }, [totalTime]);

  useEffect(() => {
    let interval;

    // Start a timer to update elapsed time every second
    if (elapsedTime < totalTime) {
      interval = setTimeout(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    }

    // Clear the timer when the component unmounts
    return () => clearTimeout(interval);
  }, [elapsedTime, totalTime]);

  const remainingTime = totalTime - elapsedTime;
  const progressPercentage = (elapsedTime / totalTime) * 100;

  return (
    <Box sx={{ width: "100%", mb: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {text}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight="medium">
          {formatTime(remainingTime)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={progressPercentage}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            background: "linear-gradient(90deg, #ff9800 0%, #ffc107 100%)",
          },
        }}
      />
    </Box>
  );
};

// Function to format time in HH:MM:SS format
const formatTime = (timeInSeconds) => {
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = timeInSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default EstimatedTimeProgress;
