import React from "react";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const ProgressBar = ({ value, max }) => {
  const percentage = (value / max) * 100;

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          GitHub Requests
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight="medium">
          {value} / {max}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            background: "linear-gradient(90deg, #2196f3 0%, #21cbf3 100%)",
          },
        }}
      />
    </Box>
  );
};

export default ProgressBar;
