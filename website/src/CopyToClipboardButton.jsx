import { useId, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

function buildShareUrl(href, { dateRange, transformation, aggregation }) {
  const url = new URL(href);
  // HashRouter keeps the route and its query inside the URL fragment.
  const route = url.hash.startsWith("#/")
    ? new URL(url.hash.slice(1), url.origin)
    : url;

  if (dateRange?.start && dateRange?.end) {
    route.searchParams.set("start", dateRange.start);
    route.searchParams.set("end", dateRange.end);
  } else {
    route.searchParams.delete("start");
    route.searchParams.delete("end");
  }

  for (const [name, value] of Object.entries({ transformation, aggregation })) {
    if (value === undefined) continue;
    if (value) route.searchParams.set(name, value);
    else route.searchParams.delete(name);
  }

  if (route !== url) {
    url.hash = `${route.pathname}${route.search}${route.hash}`;
  }
  return url.toString();
}

function CopyToClipboardButton({ dateRange, transformation, aggregation, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const dialogId = useId();

  const handleClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setOpen(false);
  };

  const handleCopyToClipboard = async () => {
    const currentUrl = buildShareUrl(window.location.href, {
      dateRange,
      transformation,
      aggregation,
    });
    setCopying(true);
    setOpen(false);
    try {
      if (!navigator.clipboard?.writeText) {
        setManualLink(currentUrl);
        return;
      }
      await navigator.clipboard.writeText(currentUrl);
      setOpen(true);
    } catch {
      setManualLink(currentUrl);
    } finally {
      setCopying(false);
    }
  };

  const action = (
    <IconButton
      size="small"
      aria-label="Dismiss link copied message"
      color="inherit"
      onClick={handleClose}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  );

  return (
    <div
      style={{
        marginLeft: "10px",
      }}
    >
      <Tooltip
        title={disabled ? "Load a repository to share its chart" : "Copy a link with your current chart settings"}
      >
        <span>
          <Button
            variant="contained"
            size="small"
            startIcon={<ContentCopyIcon />}
            disabled={disabled || copying}
            aria-busy={copying}
            onClick={handleCopyToClipboard}
          >
            {copying ? "Copying…" : "Copy link"}
          </Button>
        </span>
      </Tooltip>
      <Snackbar
        open={open}
        autoHideDuration={4000}
        onClose={handleClose}
        message="Chart link copied to clipboard"
        slotProps={{ content: { role: "status" } }}
        action={action}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
      <Dialog
        open={Boolean(manualLink)}
        onClose={() => setManualLink("")}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={`${dialogId}-title`}>Copy chart link</DialogTitle>
        <DialogContent>
          <DialogContentText id={`${dialogId}-description`}>
            Your browser couldn’t copy the link automatically. Select and copy it below to share this chart.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Chart link"
            value={manualLink}
            margin="normal"
            slotProps={{ htmlInput: { readOnly: true } }}
            onFocus={(event) => event.target.select()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualLink("")}>Done</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default CopyToClipboardButton;
