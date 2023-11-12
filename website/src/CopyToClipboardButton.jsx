import { useState } from "react";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import * as React from "react";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

function CopyToClipboardButton() {
  const [open, setOpen] = useState(false);

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setOpen(false);
  };

  const handleCopyToClipboard = () => {
    // Get the current URL from the browser's location
    const currentUrl = window.location.href;

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
      <Button variant="contained" size="small" onClick={handleCopyToClipboard}>
        Copy URL
      </Button>
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
