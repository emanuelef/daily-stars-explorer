import { useEffect, useState } from 'react';
import './App.css';
import { Link } from 'react-router-dom';

// Use the same HOST variable as in TimeSeriesChart
const HOST = import.meta.env.VITE_HOST;
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TableSortLabel } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';
import LinkIcon from '@mui/icons-material/Link';
import GitHubIcon from '@mui/icons-material/GitHub';
import ShowChartIcon from '@mui/icons-material/ShowChart';

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

function ShowHNPage() {
  const [allPosts, setAllPosts] = useState<ShowHNPost[]>([]);
  const [sortedPosts, setSortedPosts] = useState<ShowHNPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'points' | 'comments'>('points');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Fetch ShowHN posts - only once when component mounts
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        // Fetch data with default sort by points in descending order
        const response = await fetch(`${HOST}/showhn?sort=points`);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Log initial data count before filtering
        console.log(`Retrieved ${data.length} Show HN posts from API`);
        
        setAllPosts(data);
        // Apply initial filtering and sorting
        sortPosts(data, sortBy, sortDirection);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPosts();
  }, []); // Empty dependency array - only fetch once on mount
  
  // Function to sort posts based on criteria and filter out invalid GitHub repos
  const sortPosts = (posts: ShowHNPost[], sortField: 'date' | 'points' | 'comments', direction: 'asc' | 'desc') => {
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
  };
  
  // Sort posts whenever sort criteria changes
  useEffect(() => {
    sortPosts(allPosts, sortBy, sortDirection);
  }, [sortBy, sortDirection, allPosts]);
  
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  const handleSortChange = (newSortBy: 'date' | 'points' | 'comments') => {
    // If clicking on the same column that's already being sorted, toggle the direction
    if (sortBy === newSortBy) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to descending when switching columns
      setSortBy(newSortBy);
      setSortDirection('desc');
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" color="error">Error loading ShowHN posts: {error}</Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        GitHub Projects from Show HN
      </Typography>
      <Typography variant="subtitle1" gutterBottom color="text.secondary">
        Trending GitHub projects featured on Hacker News "Show HN" 
        (Only posts with valid GitHub repository links are shown)
      </Typography>
      
      <TableContainer component={Paper} sx={{ mt: 3 }}>
        <Table sx={{ minWidth: 650 }} aria-label="showhn table">
          <TableHead>
            <TableRow>
              <TableCell>Project</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortBy === 'points'}
                  direction={sortBy === 'points' ? sortDirection : 'desc'}
                  onClick={() => handleSortChange('points')}
                >
                  Points
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
            {sortedPosts
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((post: ShowHNPost, index: number) => {
                const repoDetails = extractRepoDetails(post.url);
                
                return (
                  <StyledTableRow key={post.object_id || index}>
                    <TableCell component="th" scope="row">
                      <Typography variant="body1">
                        {cleanTitle(post.title)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{post.points}</TableCell>
                    <TableCell align="right">{post.num_comments}</TableCell>
                    <TableCell align="right">{formatDate(post.created_at)}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                        {/* Link to HN discussion */}
                        <a href={post.hn_link} target="_blank" rel="noopener noreferrer">
                          <LinkIcon color="primary" titleAccess="HN Discussion" />
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
              })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={sortedPosts.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
}

export default ShowHNPage;
