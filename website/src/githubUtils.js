const stripTrailingSlash = (str) =>
  str.charAt(str.length - 1) == "/" ? str.substr(0, str.length - 1) : str;

const parseGitHubRepoURL = (url) => {
  url = url.replaceAll(" ", "");
  url = url.toLowerCase();
  url = stripTrailingSlash(url);
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
