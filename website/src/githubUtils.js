const parseGitHubRepoURL = (url) => {
  url = url.replaceAll(" ", "");
  url = url.toLowerCase();
  // Define the regular expression pattern to match GitHub repository URLs
  const repoURLPattern =
    /^(?:https?:\/\/github.com\/)?(?:\/)?([^/]+)\/([^/]+)$/;

  // Use RegExp.exec to match the pattern against the URL
  const match = repoURLPattern.exec(url);

  if (match && match.length === 3) {
    const owner = match[1];
    const repoName = match[2];
    return `${owner}/${repoName}`;
  } else {
    return null; // Invalid URL
  }
};

export { parseGitHubRepoURL };
