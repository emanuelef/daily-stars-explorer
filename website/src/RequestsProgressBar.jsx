import React from "react";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const RequestsProgressBar = ({ remainingRequests, totalRequests }) => {
  const progress = (remainingRequests / totalRequests) * 100;

  return (
    <Box sx={{ width: "100%", px: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Remaining Requests
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight="medium">
          {remainingRequests} / {totalRequests}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            background: "linear-gradient(90deg, #4caf50 0%, #8bc34a 100%)",
          },
        }}
      />
    </Box>
  );
};

export default RequestsProgressBar;
