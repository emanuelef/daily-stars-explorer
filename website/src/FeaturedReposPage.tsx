import { useEffect, useState, useCallback } from 'react';
import './App.css';
import { Link, useSearchParams } from 'react-router-dom';

// Use the same HOST variable as in TimeSeriesChart
const HOST = import.meta.env.VITE_HOST;
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TableSortLabel, ToggleButtonGroup, ToggleButton } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';
import LinkIcon from '@mui/icons-material/Link';
import GitHubIcon from '@mui/icons-material/GitHub';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RedditIcon from '@mui/icons-material/Reddit';

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '&:nth-of-type(odd)': {
    backgroundColor: theme.palette.action.hover,
  },
  // hide last border
  '&:last-child td, &:last-child th': {
    border: 0,
  },
}));

// Type definition for ShowHN post
interface ShowHNPost {
  title: string;
  url: string;
  points: number;
  num_comments: number;
  created_at: string;
  hn_link: string;
  is_github_repo: boolean;
  object_id: string;
}

// Type definition for Reddit post
interface RedditGitHubPost {
  title: string;
  url: string;
  points: number;
  num_comments: number;
  created_at: string;
  reddit_link: string;
  is_github_repo: boolean;
  post_id: string;
  subreddit: string;
}

// Union type for posts from different sources
type GitHubPost = ShowHNPost | RedditGitHubPost;

// Type guard to check if a post is from ShowHN
function isShowHNPost(post: GitHubPost): post is ShowHNPost {
  return 'hn_link' in post;
}

// Type guard to check if a post is from Reddit
function isRedditPost(post: GitHubPost): post is RedditGitHubPost {
  return 'reddit_link' in post;
}

// Function to extract GitHub username and repository name from URL
const extractRepoDetails = (url: string): { user: string; repository: string } | null => {
  try {
    if (!url) return null;

    // Handle various GitHub URL formats
    // Standard format: github.com/user/repo
    // Also handle: github.com/user/repo/
    // And: github.com/user/repo/tree/main, github.com/user/repo/issues, etc.
    const githubUrlPattern = /github\.com\/([^\/]+)\/([^\/\?#]+)/;
    const match = url.match(githubUrlPattern);

    if (match && match.length >= 3) {
      const user = match[1];
      let repository = match[2];

      // Skip if the user or repository part is not valid
      if (user === '' || repository === '' ||
        user === 'orgs' || user === 'settings' ||
        repository === 'settings' || repository === 'dashboard') {
        return null;
      }

      // Clean repository name (remove .git suffix if present)
      if (repository.endsWith('.git')) {
        repository = repository.substring(0, repository.length - 4);
      }

      return { user, repository };
    }
    return null;
  } catch (e) {
    console.error("Error extracting repo details:", e);
    return null;
  }
};

// Function to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Function to clean the title by removing "Show HN:" prefix
const cleanTitle = (title: string): string => {
  return title.replace(/^Show\s+HN\s*:\s*/i, '');
};

function FeaturedReposPage() {
  // State variables
  const [allPosts, setAllPosts] = useState<GitHubPost[]>([]);
  const [sortedPosts, setSortedPosts] = useState<GitHubPost[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingHeader, setLoadingHeader] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // URL parameters for state persistence
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Function to get persisted state from localStorage or URL
  const getInitialState = () => {
    // For source selection (hackernews or reddit)
    const getInitialSource = (): 'hackernews' | 'reddit' => {
      const savedSource = localStorage.getItem('featuredReposSource');
      if (savedSource === 'hackernews' || savedSource === 'reddit') {
        return savedSource;
      }
      return (searchParams.get('source') as 'hackernews' | 'reddit') || 'hackernews';
    };
    
    // For sort field (points, comments, date)
    const getInitialSortBy = (): 'date' | 'points' | 'comments' => {
      const savedSortBy = localStorage.getItem('featuredReposSortBy');
      if (savedSortBy === 'date' || savedSortBy === 'points' || savedSortBy === 'comments') {
        return savedSortBy;
      }
      return (searchParams.get('sort') as 'date' | 'points' | 'comments') || 'points';
    };
    
    // For sort direction (asc, desc)
    const getInitialSortDirection = (): 'asc' | 'desc' => {
      const savedDirection = localStorage.getItem('featuredReposSortDirection');
      if (savedDirection === 'asc' || savedDirection === 'desc') {
        return savedDirection;
      }
      return (searchParams.get('dir') as 'asc' | 'desc') || 'desc';
    };
    
    // For page number
    const getInitialPage = (): number => {
      const savedPage = localStorage.getItem('featuredReposPage');
      if (savedPage !== null) {
        const parsedPage = parseInt(savedPage);
        if (!isNaN(parsedPage) && parsedPage >= 0) {
          return parsedPage;
        }
      }
      return parseInt(searchParams.get('page') || '0');
    };
    
    // For rows per page
    const getInitialRowsPerPage = (): number => {
      const savedRows = localStorage.getItem('featuredReposRowsPerPage');
      if (savedRows !== null) {
        const parsedRows = parseInt(savedRows);
        if (!isNaN(parsedRows) && [5, 10, 25, 50].includes(parsedRows)) {
          return parsedRows;
        }
      }
      return parseInt(searchParams.get('rows') || '10');
    };
    
    return {
      source: getInitialSource(),
      sortBy: getInitialSortBy(),
      sortDirection: getInitialSortDirection(),
      page: getInitialPage(),
      rowsPerPage: getInitialRowsPerPage(),
    };
  };
  
  // Get initial state combining localStorage and URL parameters
  const initialState = getInitialState();
  
  // Set up state with persisted values
  const [sortBy, setSortBy] = useState<'date' | 'points' | 'comments'>(initialState.sortBy);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialState.sortDirection);
  const [page, setPage] = useState(initialState.page);
  const [rowsPerPage, setRowsPerPage] = useState(initialState.rowsPerPage);
  const [source, setSource] = useState<'hackernews' | 'reddit'>(initialState.source);

  // Update URL params and localStorage when state changes
  const updateUrlParams = useCallback(() => {
    // Update URL parameters for bookmarkability
    const params = new URLSearchParams();
    params.set('source', source);
    params.set('sort', sortBy);
    params.set('dir', sortDirection);
    params.set('page', page.toString());
    params.set('rows', rowsPerPage.toString());
    setSearchParams(params);
    
    // Sync all state to localStorage for persistence across navigation
    localStorage.setItem('featuredReposSource', source);
    localStorage.setItem('featuredReposSortBy', sortBy);
    localStorage.setItem('featuredReposSortDirection', sortDirection);
    localStorage.setItem('featuredReposPage', page.toString());
    localStorage.setItem('featuredReposRowsPerPage', rowsPerPage.toString());
  }, [source, sortBy, sortDirection, page, rowsPerPage, setSearchParams]);
  
  // Update URL and localStorage when any of the relevant state changes
  useEffect(() => {
    updateUrlParams();
  }, [sortBy, sortDirection, page, rowsPerPage, source, updateUrlParams]);

  // Function to sort posts based on criteria and filter out invalid GitHub repos
  const sortPosts = useCallback((posts: GitHubPost[], sortField: 'date' | 'points' | 'comments', direction: 'asc' | 'desc') => {
    if (!posts || posts.length === 0) return [];

    // First filter out posts that don't have a valid GitHub repository URL
    const validGitHubPosts = posts.filter(post => {
      // Check if post is marked as a GitHub repo
      if (!post.is_github_repo) return false;

      // Verify if URL can be parsed into user/repository format
      const repoDetails = extractRepoDetails(post.url);

      if (!repoDetails) {
        console.debug(`Filtered out post: "${post.title}" with URL: ${post.url}`);
      }

      return repoDetails !== null;
    });

    console.log(`Filtered to ${validGitHubPosts.length} valid GitHub repos out of ${posts.length} total posts`);

    const sorted = [...validGitHubPosts].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'points':
          comparison = a.points - b.points;
          break;
        case 'comments':
          comparison = a.num_comments - b.num_comments;
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return direction === 'asc' ? comparison : -comparison;
    });

    setSortedPosts(sorted);
  }, []);

  // Fetch posts from selected source
  const fetchPosts = useCallback(async () => {
    // Show loading only in table area, keep header visible
    setLoadingHeader(false);
    setLoading(true);
    
    try {
      // Determine endpoint based on selected source
      const endpoint = source === 'hackernews' ? 'showhn' : 'redditrepos';

      // Fetch data with default sort by points in descending order
      const response = await fetch(`${HOST}/${endpoint}?sort=points`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Retrieved ${data.length} ${source === 'hackernews' ? 'Show HN' : 'Reddit'} posts from API`);

      setAllPosts(data);
      // Apply initial filtering and sorting
      sortPosts(data, sortBy, sortDirection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [source, sortBy, sortDirection, sortPosts]);

  // Load all persisted state on component mount
  useEffect(() => {
    // We already loaded initial state from localStorage in the initialization,
    // so we don't need to do anything here anymore.
    // The component initializes with proper state from localStorage/URL
  }, []);
  
  // Initial data fetch
  useEffect(() => {
    fetchPosts();
  }, [source, fetchPosts]);

  // Sort posts whenever sort criteria changes
  useEffect(() => {
    sortPosts(allPosts, sortBy, sortDirection);
  }, [sortBy, sortDirection, allPosts, sortPosts]);

  // Event handlers
  const handleChangePage = (_event: unknown, newPage: number) => {
    // Save to localStorage
    localStorage.setItem('featuredReposPage', newPage.toString());
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    // Save to localStorage
    localStorage.setItem('featuredReposRowsPerPage', newRowsPerPage.toString());
    setRowsPerPage(newRowsPerPage);
    
    // Reset page to 0 when changing rows per page
    localStorage.setItem('featuredReposPage', '0');
    setPage(0);
  };

  const handleSortChange = (newSortBy: 'date' | 'points' | 'comments') => {
    let newDirection = 'desc';
    
    // If clicking on the same column that's already being sorted, toggle the direction
    if (sortBy === newSortBy) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection as 'asc' | 'desc');
      // Save to localStorage
      localStorage.setItem('featuredReposSortDirection', newDirection);
    } else {
      // Default to descending when switching columns
      setSortBy(newSortBy);
      setSortDirection('desc');
      // Save to localStorage
      localStorage.setItem('featuredReposSortBy', newSortBy);
      localStorage.setItem('featuredReposSortDirection', 'desc');
    }
  };

  // UI rendering starts here
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Featured GitHub Repositories
      </Typography>
      <Typography variant="subtitle1" gutterBottom color="text.secondary">
        GitHub repositories featured on social platforms like Hacker News and Reddit
        (Only posts with valid GitHub repository links are shown)
      </Typography>

      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          color="primary"
          value={source}
          exclusive
          onChange={(_, newSource) => {
            if (newSource) {
              // Save to localStorage for persistence across navigation
              localStorage.setItem('featuredReposSource', newSource);
              setSource(newSource);
              // Update URL as well for bookmarking
              const params = new URLSearchParams(searchParams);
              params.set('source', newSource);
              setSearchParams(params);
            }
          }}
          aria-label="Data source"
        >
          <ToggleButton value="hackernews">Hacker News</ToggleButton>
          <ToggleButton value="reddit">Reddit</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {loadingHeader ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {error ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="h5" color="error">Error loading posts: {error}</Typography>
            </Box>
          ) : (
            <>
              <TableContainer component={Paper} sx={{ mt: 3 }}>
                <Table sx={{ minWidth: 650 }} aria-label="github repos table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Project</TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortBy === 'points'}
                          direction={sortBy === 'points' ? sortDirection : 'desc'}
                          onClick={() => handleSortChange('points')}
                        >
                          {source === 'hackernews' ? 'Points' : 'Upvotes'}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortBy === 'comments'}
                          direction={sortBy === 'comments' ? sortDirection : 'desc'}
                          onClick={() => handleSortChange('comments')}
                        >
                          Comments
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortBy === 'date'}
                          direction={sortBy === 'date' ? sortDirection : 'desc'}
                          onClick={() => handleSortChange('date')}
                        >
                          Date
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">Links</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                          <CircularProgress />
                        </TableCell>
                      </TableRow>
                    ) : sortedPosts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          No repositories found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedPosts
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((post: GitHubPost, index: number) => {
                          const repoDetails = extractRepoDetails(post.url);
                          const isHN = isShowHNPost(post);

                          return (
                            <StyledTableRow key={(isHN ? post.object_id : post.post_id) || index}>
                              <TableCell component="th" scope="row">
                                <Typography variant="body1">
                                  {cleanTitle(post.title)}
                                  {!isHN && <Typography component="span" variant="body2" color="text.secondary"> (r/{(post as RedditGitHubPost).subreddit})</Typography>}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{post.points}</TableCell>
                              <TableCell align="right">{post.num_comments}</TableCell>
                              <TableCell align="right">{formatDate(post.created_at)}</TableCell>
                              <TableCell align="center">
                                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                                  {/* Link to discussion */}
                                  <a href={isHN ? post.hn_link : (post as RedditGitHubPost).reddit_link} target="_blank" rel="noopener noreferrer">
                                    {isHN ? (
                                      <LinkIcon color="primary" titleAccess="HN Discussion" />
                                    ) : (
                                      <RedditIcon color="primary" titleAccess="Reddit Discussion" />
                                    )}
                                  </a>

                                  {/* Link to GitHub repo */}
                                  <a href={post.url} target="_blank" rel="noopener noreferrer">
                                    <GitHubIcon color="primary" titleAccess="GitHub Repo" />
                                  </a>

                                  {/* Link to Timeline view */}
                                  {repoDetails && (
                                    <Link to={`/${repoDetails.user}/${repoDetails.repository}`}>
                                      <ShowChartIcon color="primary" titleAccess="Star History Timeline" />
                                    </Link>
                                  )}
                                </Box>
                              </TableCell>
                            </StyledTableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {!loading && (
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  component="div"
                  count={sortedPosts.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                />
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}

export default FeaturedReposPage;
