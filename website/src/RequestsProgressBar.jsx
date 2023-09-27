import React from "react";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

const RequestsProgressBar = ({ remainingRequests, totalRequests }) => {
  const progress = (remainingRequests / totalRequests) * 100;

  return (
    <div>
      <Typography variant="subtitle1" gutterBottom>
        Remaining Requests: {remainingRequests} / {totalRequests}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ width: "100%", marginTop: 2 }}
      />
    </div>
  );
};

export default RequestsProgressBar;
