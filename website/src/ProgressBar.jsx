import React from "react";
import LinearProgress from "@mui/material/LinearProgress";

const ProgressBar = ({ value, max }) => {
  // Calculate the percentage completion
  const percentage = (value / max) * 100;

  return (
    <div>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{ width: "100%" }}
      />
      <div style={{ textAlign: "center" }}>{`${value} / ${max}`}</div>
    </div>
  );
};

export default ProgressBar;
