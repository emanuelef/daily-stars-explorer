import Button from "@mui/material/Button";

function CopyToClipboardButton() {
  const handleCopyToClipboard = () => {
    // Get the current URL from the browser's location
    const currentUrl = window.location.href;

    // Try to copy the URL to the clipboard
    navigator.clipboard
      .writeText(currentUrl)
      .then(() => {
        // Handle successful copy (e.g., show a success message)
        console.log("URL copied to clipboard:", currentUrl);
      })
      .catch((error) => {
        // Handle copy error (e.g., display an error message)
        console.error("Copy to clipboard failed:", error);
      });
  };

  return (
    <div
      style={{
        marginLeft: "10px",
      }}
    >
      <Button variant="contained" size="small" onClick={handleCopyToClipboard}>
        Copy URL
      </Button>
    </div>
  );
}

export default CopyToClipboardButton;
