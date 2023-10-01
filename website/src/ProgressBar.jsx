import React from "react";
import LinearProgress from "@mui/material/LinearProgress";

const ProgressBar = ({ value, max }) => {
  // Calculate the percentage completion
  const percentage = (value / max) * 100;

  return (
    <div
      style={{
        marginTop: "10px",
        marginRight: "20px",
        marginLeft: "10px",
        width: "1170px",
      }}
    >
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{ width: "100%" }}
      />
      <div style={{ textAlign: "left" }}>{`GH Requests ${value} / ${max}`}</div>
    </div>
  );
};

export default ProgressBar;
