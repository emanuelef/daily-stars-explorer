import { useState } from "react";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Tooltip from "@mui/material/Tooltip";
import * as React from "react";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

function CopyToClipboardButton({ dateRange, aggregation }) {
  const [open, setOpen] = useState(false);

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setOpen(false);
  };

  const handleCopyToClipboard = () => {
    // Get the current URL from the browser's location
    let currentUrl = window.location.href;

    if (dateRange && dateRange.start && dateRange.end) {
      currentUrl += `?start=${dateRange.start}&end=${dateRange.end}`;
      if (aggregation) {
        currentUrl += `&aggregation=${aggregation}`;
      }
    } else if (aggregation) {
      currentUrl += `?aggregation=${aggregation}`;
    }

    // Try to copy the URL to the clipboard
    navigator.clipboard
      .writeText(currentUrl)
      .then(() => {
        // Handle successful copy (e.g., show a success message)
        console.log("URL copied to clipboard:", currentUrl);
        setOpen(true);
      })
      .catch((error) => {
        // Handle copy error (e.g., display an error message)
        console.error("Copy to clipboard failed:", error);
      });
  };

  const action = (
    <React.Fragment>
      <IconButton
        size="small"
        aria-label="close"
        color="inherit"
        onClick={handleClose}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </React.Fragment>
  );

  return (
    <div
      style={{
        marginLeft: "10px",
      }}
    >
      <Tooltip
        enterDelay={1500}
        title={"Copy the url to the clipboard to share this repo stars history"}
      >
        <Button
          variant="contained"
          size="small"
          onClick={handleCopyToClipboard}
        >
          Share URL
        </Button>
      </Tooltip>
      <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={handleClose}
        message="URL copied to clipboard"
        action={action}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </div>
  );
}

export default CopyToClipboardButton;
