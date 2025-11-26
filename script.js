const apiKey = 'here api key ';
const apiUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=popularity.desc`;

// Pagination variables
let currentPage = 1;
let totalPages = 1;
let currentCategory = 'popular';
let currentSearchQuery = '';
let currentGenreId = '';

// Utility function to fetch and display movies
async function fetchAndDisplayMovies(url, title = 'Popular Movies', resetPage = true) {
  if (resetPage) currentPage = 1;
  
  const movieListSection = document.getElementById('movie-list');
  const movieDetailsSection = document.getElementById('movie-details-section');
  const personDetailsSection = document.getElementById('person-details-section');
  const currentCategoryTitle = document.getElementById('current-category-title');
  const paginationContainer = document.getElementById('pagination-container');

  // Hide other sections and show movie list
  if (movieDetailsSection) movieDetailsSection.style.display = 'none';
  if (personDetailsSection) personDetailsSection.style.display = 'none';
  if (movieListSection) movieListSection.style.display = 'flex';

  // Update title and show loading state
  if (currentCategoryTitle) currentCategoryTitle.textContent = title;
  if (movieListSection) movieListSection.innerHTML = '<div class="loading-spinner"></div>';
  if (paginationContainer) paginationContainer.innerHTML = '';

  try {
    const response = await fetch(`${url}&page=${currentPage}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    totalPages = data.total_pages > 500 ? 500 : data.total_pages; // TMDB API limits pages to 500
    displayMovies(data.results);
    updatePaginationControls();
  } catch (error) {
    console.error('Error fetching movies:', error);
    if (movieListSection) movieListSection.innerHTML = '<p class="error-message">Error loading movies. Please try again.</p>';
  }
}

// Update pagination controls
function updatePaginationControls() {
  const paginationContainer = document.getElementById('pagination-container');
  if (!paginationContainer || totalPages <= 1) return;

  paginationContainer.innerHTML = '';

  // Previous button
  const prevButton = document.createElement('button');
  prevButton.innerHTML = '«';
  prevButton.className = 'pagination-button';
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadMoviesForCurrentCategory();
    }
  });
  paginationContainer.appendChild(prevButton);

  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    const firstPageButton = document.createElement('button');
    firstPageButton.textContent = '1';
    firstPageButton.className = 'pagination-button';
    firstPageButton.addEventListener('click', () => {
      currentPage = 1;
      loadMoviesForCurrentCategory();
    });
    paginationContainer.appendChild(firstPageButton);

    if (startPage > 2) {
      const ellipsis = document.createElement('span');
      ellipsis.textContent = '...';
      ellipsis.className = 'pagination-ellipsis';
      paginationContainer.appendChild(ellipsis);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
    pageButton.addEventListener('click', () => {
      currentPage = i;
      loadMoviesForCurrentCategory();
    });
    paginationContainer.appendChild(pageButton);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement('span');
      ellipsis.textContent = '...';
      ellipsis.className = 'pagination-ellipsis';
      paginationContainer.appendChild(ellipsis);
    }

    const lastPageButton = document.createElement('button');
    lastPageButton.textContent = totalPages;
    lastPageButton.className = 'pagination-button';
    lastPageButton.addEventListener('click', () => {
      currentPage = totalPages;
      loadMoviesForCurrentCategory();
    });
    paginationContainer.appendChild(lastPageButton);
  }

  // Next button
  const nextButton = document.createElement('button');
  nextButton.innerHTML = '»';
  nextButton.className = 'pagination-button';
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadMoviesForCurrentCategory();
    }
  });
  paginationContainer.appendChild(nextButton);
}

// Load movies based on current category
function loadMoviesForCurrentCategory() {
  let url = '';
  let title = '';

  switch (currentCategory) {
    case 'popular':
      url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}`;
      title = 'Popular Movies';
      break;
    case 'top_rated':
      url = `https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}`;
      title = 'Top Rated Movies';
      break;
    case 'trending':
      url = `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}`;
      title = 'Trending Movies';
      break;
    case 'search':
      url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(currentSearchQuery)}`;
      title = `Search Results for "${currentSearchQuery}"`;
      break;
    case 'genre':
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_genres=${currentGenreId}`;
      const genreName = document.querySelector(`#genre-select option[value="${currentGenreId}"]`).textContent;
      title = `${genreName} Movies`;
      break;
    default:
      url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}`;
      title = 'Popular Movies';
  }

  fetchAndDisplayMovies(url, title, false);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  updateUserUI();
  toggleNightMode(false);

  // Initialize movie-related functionality if on the main page
  if (document.getElementById('movie-list')) {
    loadGenres();
    fetchAndDisplayMovies(apiUrl, 'Popular Movies');
    
    // Set up event listeners for search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchMovies();
      });
    }
  }

  // Initialize profile page functionality
  if (window.location.pathname.includes('profile.html')) {
    loadUserAvatar();
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('random-avatar-btn')?.addEventListener('click', chooseDefaultAvatar);
  }

  // Check for URL parameters
  checkUrlParameters();
});

// Check for URL parameters (search, movie ID)
function checkUrlParameters() {
  if (!document.getElementById('movie-list')) return;

  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  const movieIdFromUrl = urlParams.get('movie');

  if (searchQuery) {
    document.getElementById('search-input').value = decodeURIComponent(searchQuery);
    searchMovies();
  } else if (movieIdFromUrl) {
    showMovieDetails(movieIdFromUrl);
  }
}

// Avatar Functions
function loadUserAvatar() {
  const username = getCookie('username');
  if (!username) return;
  
  const avatarImg = document.getElementById('user-avatar');
  if (!avatarImg) return;
  
  // Check localStorage for saved avatar
  const savedAvatar = localStorage.getItem(`${username}_avatar`);
  if (savedAvatar) {
    avatarImg.src = savedAvatar;
  } else {
    // Use a default avatar if no custom one exists
    const defaultIndex = hashString(username) % 5 + 1; // Using 5 default avatars
    avatarImg.src = `https://i.pravatar.cc/150?img=${defaultIndex}`;
  }
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const username = getCookie('username');
  if (!username) {
    showToast('Please log in to change your avatar.', true);
    return;
  }

  // Validate file type
  if (!file.type.match('image.*')) {
    showToast('Please select an image file (JPEG, PNG, etc.)', true);
    return;
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image size should be less than 2MB', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const avatarImg = document.getElementById('user-avatar');
    if (avatarImg) {
      avatarImg.src = e.target.result;
      // Save to localStorage
      localStorage.setItem(`${username}_avatar`, e.target.result);
      showToast('Avatar updated successfully!');
    }
  };
  reader.onerror = function() {
    showToast('Error reading the image file. Please try another image.', true);
  };
  reader.readAsDataURL(file);
}

function chooseDefaultAvatar() {
  const username = getCookie('username');
  if (!username) {
    showToast('Please log in to change your avatar.', true);
    return;
  }

  const defaultAvatars = [
    'https://i.pravatar.cc/150?img=1',
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=5',
    'https://i.pravatar.cc/150?img=7',
    'https://i.pravatar.cc/150?img=9'
  ];
  
  const randomAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
  const avatarImg = document.getElementById('user-avatar');
  if (avatarImg) {
    avatarImg.src = randomAvatar;
    // Save to localStorage
    localStorage.setItem(`${username}_avatar`, randomAvatar);
    showToast('Default avatar selected!');
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Display movies in the main grid
function displayMovies(movies) {
  const movieList = document.getElementById('movie-list');
  if (!movieList) return;

  movieList.innerHTML = '';
  const username = getCookie('username');

  if (movies.length === 0) {
    movieList.innerHTML = '<p class="no-results">No movies found.</p>';
    return;
  }

  movies.forEach(movie => {
    const movieCard = document.createElement('div');
    movieCard.classList.add('movie-card');
    movieCard.setAttribute('data-id', movie.id);

    const posterPath = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://placehold.co/500x750?text=No+Image';

    const watchlistButtonHtml = username ?
      `<button onclick="addToWatchlist(${movie.id}, '${escapeHtml(movie.title)}')" class="watchlist-btn">Add to Watchlist</button>` :
      `<button onclick="showLoginAlert()" class="watchlist-btn disabled">Add to Watchlist</button>`;

    const favoriteButtonHtml = username ?
      `<button onclick="addToFavorites(${movie.id}, '${escapeHtml(movie.title)}')" class="watchlist-btn favorite-btn"><i class="fa-solid fa-heart"></i> Favorite</button>` :
      `<button onclick="showLoginAlert()" class="watchlist-btn favorite-btn disabled"><i class="fa-regular fa-heart"></i> Favorite</button>`;

    // Watched status indicator
    const watchedProgress = getWatchedProgress(movie.id);
    const watchedIndicator = watchedProgress > 0 ? 
      `<div class="watched-indicator" style="width: ${watchedProgress}%"></div>` : '';

    movieCard.innerHTML = `
      <img src="${posterPath}" alt="${escapeHtml(movie.title)}" onerror="this.src='https://placehold.co/500x750?text=Image+Error'" onclick="showMovieDetails(${movie.id})">
      <div class="movie-info">
        <h3>${escapeHtml(movie.title)}</h3>
        <p><strong>Rating:</strong> ${movie.vote_average.toFixed(1)} / 10</p>
        <p>${movie.release_date || 'Unknown date'}</p>
        ${watchlistButtonHtml}
        ${favoriteButtonHtml}
      </div>
      ${watchedIndicator}
    `;
    movieList.appendChild(movieCard);
  });
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Show login alert for unauthorized actions
function showLoginAlert() {
  showToast('Please log in to use this feature.', true);
}

// Toast notification system
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }, 100);
}

// Search Movies Function
function searchMovies() {
  const queryInput = document.getElementById('search-input');
  const query = queryInput ? queryInput.value.trim() : '';
  currentSearchQuery = query;

  if (query === '') {
    showToast('Please enter a movie title to search.', true);
    return;
  }

  currentCategory = 'search';
  
  if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
    window.location.href = `index.html?search=${encodeURIComponent(query)}`;
  } else {
    loadMoviesForCurrentCategory();
  }
}

// Movie Details Page Function with Share Buttons
async function showMovieDetails(movieId) {
  const movieDetailsSection = document.getElementById('movie-details-section');
  const movieDetailsContent = document.getElementById('movie-details-content');
  const movieListSection = document.getElementById('movie-list');
  const personDetailsSection = document.getElementById('person-details-section');
  const currentCategoryTitle = document.getElementById('current-category-title');

  if (movieDetailsSection && movieDetailsContent) {
    if (movieListSection) movieListSection.style.display = 'none';
    if (personDetailsSection) personDetailsSection.style.display = 'none';
    movieDetailsSection.style.display = 'block';
    movieDetailsContent.innerHTML = '<div class="loading-spinner"></div>';
    if (currentCategoryTitle) currentCategoryTitle.textContent = 'Movie Details';
  } else {
    window.location.href = `index.html?movie=${movieId}`;
    return;
  }

  try {
    const [movieResponse, videosResponse] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&append_to_response=credits,release_dates,recommendations,collections`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${apiKey}`)
    ]);

    if (!movieResponse.ok) throw new Error('Movie details not found.');
    const movie = await movieResponse.json();
    const videos = await videosResponse.json();

    const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://placehold.co/500x750?text=No+Image';
    const backdropPath = movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : '';
    const genres = movie.genres?.map(g => g.name).join(', ') || 'N/A';
    const budget = movie.budget > 0 ? `$${movie.budget.toLocaleString()}` : 'N/A';
    const revenue = movie.revenue > 0 ? `$${movie.revenue.toLocaleString()}` : 'N/A';
    const productionCompanies = movie.production_companies?.map(pc => pc.name).join(', ') || 'N/A';
    const tagline = movie.tagline ? `<p class="tagline">"${escapeHtml(movie.tagline)}"</p>` : '';

    // Get certification (parental rating)
    let certification = 'N/A';
    if (movie.release_dates?.results) {
      const usRelease = movie.release_dates.results.find(r => r.iso_3166_1 === 'US');
      if (usRelease?.release_dates?.length > 0) {
        certification = usRelease.release_dates[0].certification || 'N/A';
      }
    }

    // Prepare cast section
    let castHtml = '';
    if (movie.credits?.cast?.length > 0) {
      castHtml = '<div class="cast-list-container"><h3>Cast:</h3><div class="cast-list">';
      movie.credits.cast.slice(0, 10).forEach(member => {
        const profileImg = member.profile_path ? `https://image.tmdb.org/t/p/w92${member.profile_path}` : 'https://placehold.co/92x138?text=No+Pic';
        castHtml += `
          <div class="cast-item">
            <img src="${profileImg}" alt="${escapeHtml(member.name)}" onerror="this.src='https://placehold.co/92x138?text=Image+Error'" onclick="showActorDetails(${member.id}, '${escapeHtml(member.name)}')">
            <p><a href="#" onclick="showActorDetails(${member.id}, '${escapeHtml(member.name)}')">${escapeHtml(member.name)}</a><br>as ${escapeHtml(member.character || 'Unknown')}</p>
          </div>
        `;
      });
      castHtml += '</div></div>';
    }

    // Find director
    let directorHtml = '';
    if (movie.credits?.crew) {
      const director = movie.credits.crew.find(crew => crew.job === 'Director');
      if (director) {
        directorHtml = `<p><strong>Director:</strong> <a href="#" onclick="showActorDetails(${director.id}, '${escapeHtml(director.name)}')">${escapeHtml(director.name)}</a></p>`;
      }
    }

    // Prepare recommendations
    let recommendationsHtml = '';
    if (movie.recommendations?.results?.length > 0) {
      recommendationsHtml = '<div class="recommended-movies-container"><h3>Recommended Movies:</h3><div class="recommended-movies-grid">';
      movie.recommendations.results.slice(0, 5).forEach(recMovie => {
        const recPoster = recMovie.poster_path ? `https://image.tmdb.org/t/p/w185${recMovie.poster_path}` : 'https://placehold.co/185x278?text=No+Image';
        recommendationsHtml += `
          <div class="rec-movie-card">
            <img src="${recPoster}" alt="${escapeHtml(recMovie.title)}" onerror="this.src='https://placehold.co/185x278?text=Image+Error'" onclick="showMovieDetails(${recMovie.id})">
            <p><a href="#" onclick="showMovieDetails(${recMovie.id})">${escapeHtml(recMovie.title)}</a></p>
          </div>
        `;
      });
      recommendationsHtml += '</div></div>';
    }

    // Find trailer
    let trailerHtml = '';
    const trailer = videos.results?.find(vid => vid.type === 'Trailer' && vid.site === 'YouTube');
    if (trailer) {
      trailerHtml = `
        <div class="trailer-container">
          <h3>Trailer</h3>
          <iframe id="movie-trailer-frame" width="560" height="315" src="https://www.youtube.com/embed/${trailer.key}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
      `;
    }

    // Watched controls
    const watchedControlsHtml = updateMovieDetailsWithWatchedControls(movie);

    // Build the movie details HTML with share buttons
    movieDetailsContent.innerHTML = `
      <button onclick="goHome()" class="back-home-button"><i class="fa fa-arrow-left"></i> Back to Home</button>
      <div class="movie-backdrop" style="background-image: url('${backdropPath}')"></div>
      <div class="movie-detail-header">
        <img src="${posterPath}" alt="${escapeHtml(movie.title)}" class="movie-detail-poster" onerror="this.src='https://placehold.co/500x750?text=Image+Error'">
        <div class="movie-detail-info">
          <h2>${escapeHtml(movie.title)}</h2>
          ${tagline}
          <p><strong>Release Date:</strong> ${movie.release_date || 'Unknown'}</p>
          <p><strong>Rating:</strong> ${movie.vote_average?.toFixed(1) || 'N/A'} / 10 (${movie.vote_count || 0} votes)</p>
          <p><strong>Genres:</strong> ${genres}</p>
          <p><strong>Runtime:</strong> ${movie.runtime || 'N/A'} minutes</p>
          <p><strong>Parental Rating (US):</strong> ${certification}</p>
          ${directorHtml}
          <p><strong>Budget:</strong> ${budget}</p>
          <p><strong>Revenue:</strong> ${revenue}</p>
          <p><strong>Production Companies:</strong> ${productionCompanies}</p>
          <p><strong>Languages:</strong> ${movie.spoken_languages?.map(lang => lang.english_name).join(', ') || 'N/A'}</p>
          <button onclick="addToWatchlist(${movie.id}, '${escapeHtml(movie.title)}')" class="add-to-watchlist-btn">Add to Watchlist</button>
          <button onclick="addToFavorites(${movie.id}, '${escapeHtml(movie.title)}')" class="add-to-watchlist-btn favorite-btn"><i class="fa-solid fa-heart"></i> Add to Favorites</button>
          ${watchedControlsHtml}
          
          <div class="share-section">
            <h4>Share this movie:</h4>
            <div class="share-buttons">
              <button class="share-btn facebook" onclick="shareOnFacebook(${movie.id}, '${escapeHtml(movie.title)}')">
                <i class="fab fa-facebook-f"></i>
              </button>
              <button class="share-btn twitter" onclick="shareOnTwitter(${movie.id}, '${escapeHtml(movie.title)}')">
                <i class="fab fa-twitter"></i>
              </button>
              <button class="share-btn whatsapp" onclick="shareOnWhatsApp(${movie.id}, '${escapeHtml(movie.title)}')">
                <i class="fab fa-whatsapp"></i>
              </button>
              <button class="share-btn copy" onclick="copyMovieLink(${movie.id}, '${escapeHtml(movie.title)}')">
                <i class="fas fa-link"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="movie-detail-overview">
        <h3>Overview</h3>
        <p>${movie.overview || 'No overview available.'}</p>
      </div>
      ${castHtml}
      ${trailerHtml}
      ${recommendationsHtml}
    `;

  } catch (error) {
    console.error('Error fetching movie details:', error);
    if (movieDetailsContent) movieDetailsContent.innerHTML = `
      <p class="error-message">Error loading movie details. Please try again.</p>
      <button onclick="goHome()" class="back-home-button"><i class="fa fa-arrow-left"></i> Back to Home</button>
    `;
  }
}

// Person Details Page Function
async function showActorDetails(personId, personName) {
  const movieDetailsSection = document.getElementById('movie-details-section');
  const movieListSection = document.getElementById('movie-list');
  const personDetailsSection = document.getElementById('person-details-section');
  const personDetailsContent = document.getElementById('person-details-content');
  const currentCategoryTitle = document.getElementById('current-category-title');

  if (movieListSection) movieListSection.style.display = 'none';
  if (movieDetailsSection) movieDetailsSection.style.display = 'none';
  if (personDetailsSection) personDetailsSection.style.display = 'block';
  if (currentCategoryTitle) currentCategoryTitle.textContent = personName;
  if (personDetailsContent) personDetailsContent.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const [personResponse, creditsResponse] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${apiKey}`),
      fetch(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${apiKey}`)
    ]);

    if (!personResponse.ok) throw new Error('Person details not found.');
    const person = await personResponse.json();
    const credits = await creditsResponse.json();

    const profilePath = person.profile_path ? `https://image.tmdb.org/t/p/w300${person.profile_path}` : 'https://placehold.co/300x450?text=No+Image';
    const biography = person.biography || 'No biography available.';
    const birthday = person.birthday ? `Born: ${person.birthday} ${person.place_of_birth ? `in ${person.place_of_birth}` : ''}` : '';

    // Prepare filmography
    let filmographyHtml = '<h3>Filmography:</h3>';
    const allCredits = [];
    
    // Add cast credits
    if (credits.cast) {
      credits.cast.forEach(m => allCredits.push({ 
        ...m, 
        role: m.character ? `Actor (${m.character})` : 'Actor',
        date: m.release_date || m.first_air_date || '1900-01-01'
      }));
    }
    
    // Add crew credits (directors, writers, producers)
    if (credits.crew) {
      credits.crew
        .filter(m => ['Director', 'Writer', 'Producer'].includes(m.job))
        .forEach(m => allCredits.push({ 
          ...m, 
          role: m.job,
          date: m.release_date || m.first_air_date || '1900-01-01'
        }));
    }

    // Sort by date (newest first)
    allCredits.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allCredits.length > 0) {
      filmographyHtml += '<div class="filmography-grid">';
      allCredits.forEach(credit => {
        const creditPoster = credit.poster_path ? `https://image.tmdb.org/t/p/w185${credit.poster_path}` : 'https://placehold.co/185x278?text=No+Image';
        const releaseYear = credit.release_date ? new Date(credit.release_date).getFullYear() : 'N/A';
        filmographyHtml += `
          <div class="filmography-item">
            <img src="${creditPoster}" alt="${escapeHtml(credit.title || credit.name)}" onerror="this.src='https://placehold.co/185x278?text=Image+Error'" onclick="showMovieDetails(${credit.id})">
            <p><a href="#" onclick="showMovieDetails(${credit.id})">${escapeHtml(credit.title || credit.name)}</a> (${releaseYear})</p>
            <p class="role">${escapeHtml(credit.role)}</p>
          </div>
        `;
      });
      filmographyHtml += '</div>';
    } else {
      filmographyHtml += '<p>No filmography available.</p>';
    }

    if (personDetailsContent) {
      personDetailsContent.innerHTML = `
        <button onclick="goHome()" class="back-home-button"><i class="fa fa-arrow-left"></i> Back to Home</button>
        <div class="person-header">
          <img src="${profilePath}" alt="${escapeHtml(person.name)}" class="person-profile-pic" onerror="this.src='https://placehold.co/300x450?text=Image+Error'">
          <div class="person-info">
            <h2>${escapeHtml(person.name)}</h2>
            ${birthday ? `<p>${birthday}</p>` : ''}
            <p><strong>Known For:</strong> ${person.known_for_department || 'N/A'}</p>
          </div>
        </div>
        <div class="person-biography">
          <h3>Biography</h3>
          <p>${biography}</p>
        </div>
        ${filmographyHtml}
      `;
    }

  } catch (error) {
    console.error('Error fetching person details:', error);
    if (personDetailsContent) personDetailsContent.innerHTML = `
      <p class="error-message">Error loading details for ${personName}. Please try again.</p>
      <button onclick="goHome()" class="back-home-button"><i class="fa fa-arrow-left"></i> Back to Home</button>
    `;
  }
}

// Genre/Category Browse Functions
async function loadGenres() {
  const genreSelect = document.getElementById('genre-select');
  if (!genreSelect) return;

  try {
    const response = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}`);
    if (!response.ok) throw new Error('Failed to fetch genres.');
    const data = await response.json();
    
    // Clear existing options except the first one
    while (genreSelect.options.length > 1) {
      genreSelect.remove(1);
    }
    
    // Add new genre options
    data.genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre.id;
      option.textContent = genre.name;
      genreSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading genres:', error);
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Could not load genres';
    option.disabled = true;
    genreSelect.appendChild(option);
  }
}

function filterMoviesByGenre(genreId) {
  if (!genreId) {
    currentCategory = 'popular';
    loadMoviesForCurrentCategory();
    return;
  }
  currentGenreId = genreId;
  currentCategory = 'genre';
  loadMoviesForCurrentCategory();
}

function fetchTrendingMovies() {
  currentCategory = 'trending';
  loadMoviesForCurrentCategory();
}

function fetchTopRatedMovies() {
  currentCategory = 'top_rated';
  loadMoviesForCurrentCategory();
}

// UI and User Session Management
function goHome() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  
  currentPage = 1;
  currentCategory = 'popular';
  
  if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
    window.location.href = 'index.html';
  } else {
    loadMoviesForCurrentCategory();
  }
}

function toggleNightMode(savePreference = true) {
  const body = document.body;
  const themeIcon = document.getElementById('theme-icon');
  const isNightMode = body.classList.toggle('night-mode');

  if (themeIcon) {
    themeIcon.className = isNightMode ? 'fas fa-sun' : 'fas fa-moon';
  }

  if (savePreference) {
    localStorage.setItem('nightMode', isNightMode ? 'enabled' : 'disabled');
  } else {
    const storedTheme = localStorage.getItem('nightMode');
    if (storedTheme === 'enabled') {
      body.classList.add('night-mode');
      if (themeIcon) themeIcon.className = 'fas fa-sun';
    }
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function updateUserUI() {
  const username = getCookie('username');
  const userInfo = document.getElementById('user-info');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const profileLink = document.getElementById('profile-link');

  if (username) {
    if (userInfo) userInfo.textContent = `Hi, ${username}`;
    if (loginButton) loginButton.style.display = 'none';
    if (logoutButton) logoutButton.style.display = 'inline-block';
    if (profileLink) profileLink.style.display = 'inline-block';
  } else {
    if (userInfo) userInfo.textContent = '';
    if (loginButton) loginButton.style.display = 'inline-block';
    if (logoutButton) logoutButton.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';
  }
}

function logout() {
  document.cookie = "username=; Max-Age=0; path=/";
  const username = getCookie('username');
  if (username) {
    localStorage.removeItem(`${username}_watchlist`);
    localStorage.removeItem(`${username}_favorites`);
    localStorage.removeItem(`${username}_watched`);
  }
  location.reload();
}

function addToWatchlist(movieId, title) {
  const username = getCookie('username');
  if (!username) {
    showLoginAlert();
    return;
  }

  let watchlist = JSON.parse(localStorage.getItem(`${username}_watchlist`)) || [];
  if (!watchlist.find(m => m.id === movieId)) {
    watchlist.push({ id: movieId, title: title });
    localStorage.setItem(`${username}_watchlist`, JSON.stringify(watchlist));
    showToast(`${title} added to your watchlist!`);
  } else {
    showToast(`${title} is already in your watchlist.`, true);
  }
}

function addToFavorites(movieId, title) {
  const username = getCookie('username');
  if (!username) {
    showLoginAlert();
    return;
  }

  let favorites = JSON.parse(localStorage.getItem(`${username}_favorites`)) || [];
  if (!favorites.find(m => m.id === movieId)) {
    favorites.push({ id: movieId, title: title });
    localStorage.setItem(`${username}_favorites`, JSON.stringify(favorites));
    showToast(`${title} added to your favorites!`);
  } else {
    showToast(`${title} is already in your favorites.`, true);
  }
}

// Watched List Functions
function addToWatched(movieId, title, progress = 100) {
  const username = getCookie('username');
  if (!username) {
    showToast('Please log in to track watched movies.', true);
    return;
  }

  let watchedList = JSON.parse(localStorage.getItem(`${username}_watched`)) || [];
  const existingIndex = watchedList.findIndex(m => m.id === movieId);

  if (existingIndex >= 0) {
    // Update existing entry
    watchedList[existingIndex].progress = progress;
    watchedList[existingIndex].lastWatched = new Date().toISOString();
    showToast(`${title} progress updated to ${progress}%`);
  } else {
    // Add new entry
    watchedList.push({
      id: movieId,
      title: title,
      progress: progress,
      lastWatched: new Date().toISOString()
    });
    showToast(`${title} added to watched list`);
  }

  localStorage.setItem(`${username}_watched`, JSON.stringify(watchedList));
}

function removeFromWatched(movieId, title) {
  const username = getCookie('username');
  if (!username) return;

  let watchedList = JSON.parse(localStorage.getItem(`${username}_watched`)) || [];
  watchedList = watchedList.filter(m => m.id !== movieId);
  localStorage.setItem(`${username}_watched`, JSON.stringify(watchedList));
  showToast(`${title} removed from watched list`);
}

function getWatchedProgress(movieId) {
  const username = getCookie('username');
  if (!username) return 0;
  
  const watchedList = JSON.parse(localStorage.getItem(`${username}_watched`)) || [];
  const movie = watchedList.find(m => m.id === movieId);
  return movie ? movie.progress : 0;
}

function updateMovieDetailsWithWatchedControls(movie) {
  const username = getCookie('username');
  const currentProgress = getWatchedProgress(movie.id);

  return username ? `
    <div class="watched-controls">
      <div class="progress-container">
        <button onclick="addToWatched(${movie.id}, '${escapeHtml(movie.title)}')" class="watched-btn">
          <i class="fa-solid fa-eye"></i> ${currentProgress > 0 ? 'Update' : 'Mark as'} Watched
        </button>
        <div class="progress-input">
          <span>Progress:</span>
          <input type="range" min="0" max="100" value="${currentProgress}" 
                oninput="updateWatchProgress(${movie.id}, '${escapeHtml(movie.title)}', this.value)">
          <span class="progress-value">${currentProgress}%</span>
        </div>
      </div>
      ${currentProgress > 0 ? 
        `<button onclick="removeFromWatched(${movie.id}, '${escapeHtml(movie.title)}')" class="remove-watched-btn">
          <i class="fa-solid fa-eye-slash"></i> Remove from Watched
        </button>` : ''}
    </div>
  ` : `
    <button onclick="showLoginAlert()" class="watched-btn disabled">
      <i class="fa-regular fa-eye"></i> Mark as Watched
    </button>
  `;
}

function updateWatchProgress(movieId, title, progress) {
  document.querySelector(`.progress-value`).textContent = `${progress}%`;
  addToWatched(movieId, title, parseInt(progress));
}

// Share Functions
function shareOnFacebook(movieId, title) {
  const url = `${window.location.origin}/index.html?movie=${movieId}`;
  window.open(
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    '_blank',
    'width=600,height=400'
  );
}

function shareOnTwitter(movieId, title) {
  const url = `${window.location.origin}/index.html?movie=${movieId}`;
  window.open(
    `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Check out ${title} on LUHAR!`)}`,
    '_blank',
    'width=600,height=400'
  );
}

function shareOnWhatsApp(movieId, title) {
  const url = `${window.location.origin}/index.html?movie=${movieId}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(`Check out ${title} on LUHAR: ${url}`)}`,
    '_blank',
    'width=600,height=400'
  );
}

function copyMovieLink(movieId, title) {
  const url = `${window.location.origin}/index.html?movie=${movieId}`;
  // Use document.execCommand for broader compatibility in iframes
  const tempInput = document.createElement('input');
  document.body.appendChild(tempInput);
  tempInput.value = url;
  tempInput.select();
  try {
    document.execCommand('copy');
    showToast(`Copied link to ${title}!`);
  } catch (err) {
    console.error('Failed to copy:', err);
    showToast('Failed to copy link', true);
  } finally {
    document.body.removeChild(tempInput);
  }
}

// Admin Panel Functions (to be included in admin.html's script or a separate admin.js)

// Function to render users in the admin table
function renderUsers(users) {
    const userTableBody = document.getElementById('user-table-body');
    if (!userTableBody) return; // Ensure the element exists

    const usernameSearch = document.getElementById('username-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('role-filter')?.value || 'all';
    const suspensionFilter = document.getElementById('suspension-filter')?.value || 'all';

    const filteredUsers = users.filter(user => {
        const matchesUsername = user.username.toLowerCase().includes(usernameSearch);
        const matchesRole = roleFilter === 'all' || (roleFilter === 'admin' ? user.is_admin : !user.is_admin);
        const matchesSuspension = suspensionFilter === 'all' || 
                                  (suspensionFilter === 'suspended' ? user.is_suspended : !user.is_suspended);
        return matchesUsername && matchesRole && matchesSuspension;
    });

    userTableBody.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        const row = userTableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 7; // Adjusted colspan for new columns
        cell.style.textAlign = 'center';
        cell.textContent = 'No users found matching filters.';
        return;
    }

    filteredUsers.forEach(user => {
        const row = userTableBody.insertRow();
        row.insertCell().textContent = user.username;
        row.insertCell().textContent = user.email || 'N/A';
        row.insertCell().textContent = user.phone || 'N/A';
        row.insertCell().textContent = user.is_admin ? 'Admin' : 'User';
        row.insertCell().textContent = user.is_suspended ? 'Suspended' : 'Active';
        
        const actionsCell = row.insertCell();
        actionsCell.classList.add('user-actions'); // Add a class for styling buttons

        // Suspend/Activate button
        const suspendBtn = document.createElement('button');
        suspendBtn.className = `btn btn-sm ${user.is_suspended ? 'btn-success' : 'btn-warning'}`;
        suspendBtn.textContent = user.is_suspended ? 'Activate' : 'Suspend';
        suspendBtn.onclick = () => toggleUserSuspension(user.username, !user.is_suspended);
        actionsCell.appendChild(suspendBtn);

        // Reset Password button
        const resetPasswordBtn = document.createElement('button');
        resetPasswordBtn.className = 'btn btn-sm btn-info';
        resetPasswordBtn.textContent = 'Reset Password';
        resetPasswordBtn.onclick = () => resetUserPassword(user.username);
        actionsCell.appendChild(resetPasswordBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteUser(user.username);
        actionsCell.appendChild(deleteBtn);

        // Make Admin/Remove Admin button
        // Only show if the user is not the currently logged-in admin (to prevent self-demotion)
        const currentAdminUsername = getCookie('username'); // Assuming you have this cookie
        if (user.username !== currentAdminUsername) {
            if (!user.is_admin) {
                const makeAdminBtn = document.createElement('button');
                makeAdminBtn.className = 'btn btn-sm btn-primary';
                makeAdminBtn.textContent = 'Make Admin';
                makeAdminBtn.onclick = () => toggleAdminStatus(user.username, true);
                actionsCell.appendChild(makeAdminBtn);
            } else {
                const removeAdminBtn = document.createElement('button');
                removeAdminBtn.className = 'btn btn-sm btn-secondary';
                removeAdminBtn.textContent = 'Remove Admin';
                removeAdminBtn.onclick = () => toggleAdminStatus(user.username, false);
                actionsCell.appendChild(removeAdminBtn);
            }
        }
    });
}

// Function to toggle user suspension status
async function toggleUserSuspension(username, isSuspended) {
    if (!confirm(`Are you sure you want to ${isSuspended ? 'suspend' : 'activate'} user ${username}?`)) {
        return;
    }
    try {
        const response = await fetch('/admin/users/toggle_suspension', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}`
        });
        const text = await response.text();
        if (response.ok) {
            showToast(text);
            fetchUsers(); // Re-fetch and re-render users
        } else {
            showToast(`Error: ${text}`, true);
        }
    } catch (error) {
        console.error('Error toggling suspension:', error);
        showToast('Error toggling suspension status.', true);
    }
}

// Function to delete a user
async function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user ${username}? This action cannot be undone.`)) {
        return;
    }
    try {
        const response = await fetch('/admin/users/delete', { // Assuming a new endpoint for delete
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}`
        });
        const text = await response.text();
        if (response.ok) {
            showToast(text);
            fetchUsers(); // Re-fetch and re-render users
        } else {
            showToast(`Error: ${text}`, true);
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error deleting user.', true);
    }
}

// Function to reset user password
async function resetUserPassword(username) {
    const newPassword = prompt(`Enter new password for ${username}:`);
    if (!newPassword) {
        showToast('Password reset cancelled or new password was empty.', true);
        return;
    }
    if (!confirm(`Are you sure you want to reset the password for user ${username}?`)) {
        return;
    }
    try {
        const response = await fetch('/admin/users/reset_password', { // Assuming a new endpoint for reset password
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&new_password=${encodeURIComponent(newPassword)}`
        });
        const text = await response.text();
        if (response.ok) {
            showToast(text);
        } else {
            showToast(`Error: ${text}`, true);
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showToast('Error resetting password.', true);
    }
}

// Function to toggle admin status
async function toggleAdminStatus(username, makeAdmin) {
    if (!confirm(`Are you sure you want to ${makeAdmin ? 'make' : 'remove'} ${username} an admin?`)) {
        return;
    }
    try {
        const response = await fetch('/admin/users/toggle_admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&make_admin=${makeAdmin}`
        });
        const text = await response.text();
        if (response.ok) {
            showToast(text);
            fetchUsers(); // Re-fetch and re-render users
        } else {
            showToast(`Error: ${text}`, true);
        }
    } catch (error) {
        console.error('Error toggling admin status:', error);
        showToast('Error toggling admin status.', true);
    }
}

