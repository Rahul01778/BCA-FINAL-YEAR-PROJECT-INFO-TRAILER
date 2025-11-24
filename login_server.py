from dataclasses import fields
import os
import hashlib
import json
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from email.parser import BytesParser
from email.policy import default
import io

# --- File Paths for Content Data ---
USER_FILE = "users.txt"
MOVIE_FILE = "movies.json"
GENRE_FILE = "genres.json"
PEOPLE_FILE = "people.json"  # Reserved for future use
SETTINGS_FILE = "settings.json"
AVATAR_DIR = "user_avatars"
DEFAULT_AVATARS = ["avatar1.png", "avatar2.png", "avatar3.png"]  # You'll need to provide these images

# --- Helper Functions for Data Persistence ---

def hash_password(password):
    """Hash the password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

def load_users():
    """
    Load users from the file into a dictionary.
    Each user entry will be a dictionary:
    {
        "username": "hashed_password",
        "is_admin": True/False,
        "is_suspended": True/False,
        "email": "user@example.com",
        "phone": "123-456-7890"
    }
    """
    users = {}
    if os.path.exists(USER_FILE):
        with open(USER_FILE, "r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if line:
                    parts = line.split(",", 5)  # Now expecting up to 6 parts
                    username = parts[0]
                    password_hash = parts[1]
                    is_admin = parts[2].lower() == 'admin' if len(parts) > 2 else False
                    is_suspended = parts[3].lower() == 'suspended' if len(parts) > 3 else False
                    email = parts[4] if len(parts) > 4 else ""  #
                    phone = parts[5] if len(parts) > 5 else ""  #
                    users[username] = {
                        "password_hash": password_hash,
                        "is_admin": is_admin,
                        "is_suspended": is_suspended,
                        "email": email,  #
                        "phone": phone  #
                    }
    return users

def save_users():
    """Save users from the dictionary back to the file."""
    with open(USER_FILE, "w", encoding="utf-8") as file:
        for username, data in users.items():
            admin_status = "admin" if data["is_admin"] else "user"
            suspension_status = "suspended" if data["is_suspended"] else "active"
            email = data.get("email", "")  #
            phone = data.get("phone", "")  #
            file.write(f"{username},{data['password_hash']},{admin_status},{suspension_status},{email},{phone}\n")  #

def load_json_data(filepath):
    """Loads JSON data from a given file path."""
    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: {filepath} is empty or contains invalid JSON. Returning empty dictionary/list.")
            return {} if "movies" in filepath or "genres" in filepath or "people" in filepath else []
    return {} # Return an empty dictionary for movies, genres, people

def save_json_data(data, filepath): # Flipped arguments for consistency
    """Saves JSON data to a given file path."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

# --- Helper Functions for Application Settings ---
def load_settings():
    """Loads settings from the settings.json file."""
    if os.path.exists(SETTINGS_FILE) and os.path.getsize(SETTINGS_FILE) > 0:
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: {SETTINGS_FILE} is empty or contains invalid JSON. Using default settings.")
            return {
                "TMDB_API_KEY": "29a4388f3ecf68e539a54511a66f2bc5",
                "ALLOW_SIGNUP": True,
                "SITE_ANNOUNCEMENT": "",
                "ANNOUNCEMENT_ACTIVE": False
            }
    # Default settings if file doesn't exist or is empty/invalid
    return {
        "TMDB_API_KEY": "29a4388f3ecf68e539a54511a66f2bc5",  # IMPORTANT: Replace with your actual TMDb API key or a placeholder
        "ALLOW_SIGNUP": True,
        "SITE_ANNOUNCEMENT": "",
        "ANNOUNCEMENT_ACTIVE": False
    }

def save_settings(settings_data):
    """Saves settings to the settings.json file."""
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings_data, f, indent=4)

# Load data at startup
users = load_users()
# Ensure managed_movies, managed_genres, managed_people are dictionaries for ID-based access
managed_movies = load_json_data(MOVIE_FILE)
if not isinstance(managed_movies, dict): # Convert list to dict if old format
    managed_movies = {movie.get("id", str(uuid.uuid4())): movie for movie in managed_movies}

managed_genres = load_json_data(GENRE_FILE)
if not isinstance(managed_genres, dict): # Convert list to dict if old format
    managed_genres = {genre.get("id", str(uuid.uuid4())): genre for genre in managed_genres}

managed_people = load_json_data(PEOPLE_FILE)  # For future use
if not isinstance(managed_people, dict): # Convert list to dict if old format
    managed_people = {person.get("id", str(uuid.uuid4())): person for person in managed_people}

settings = load_settings()  # Load application settings at startup

# Create avatar directory if it doesn't exist
if not os.path.exists(AVATAR_DIR):
    os.makedirs(AVATAR_DIR)

# --- Request Handler Class ---

class RequestHandler(BaseHTTPRequestHandler):
    sessions = {}  # Dictionary to store active sessions: {session_id: username}

    # --- Utility Methods ---
    def parse_cookies(self):
        """Parse cookies from the request headers."""
        cookies = {}
        if "Cookie" in self.headers:
            for cookie in self.headers["Cookie"].split(";"):
                try:
                    key, value = cookie.strip().split("=", 1)
                    cookies[key] = value
                except ValueError:
                    pass  # Ignore malformed cookies
        return cookies

    def is_authenticated_admin(self):
        """Check if the current session is authenticated as an admin."""
        session_id = self.parse_cookies().get("session_id")
        username = RequestHandler.sessions.get(session_id)
        return username and users.get(username, {}).get("is_admin", False)

    def get_current_username(self):
        """Get the username for the current session."""
        session_id = self.parse_cookies().get("session_id")
        return RequestHandler.sessions.get(session_id)

    def forbidden_admin_response(self):
        """Send a 403 Forbidden response for non-admin access."""
        self.send_response(403)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>403 Forbidden: Admin privileges required</h1><p>You do not have permission to access this resource.</p>")

    def respond_with_file(self, filename, content_type):
        """Serve a static file."""
        try:
            # Added a check for file existence
            if not os.path.exists(filename):
                raise FileNotFoundError
            
            # Read in binary mode for images, text mode for others
            mode = "rb" if content_type.startswith("image/") else "r"
            
            # Explicitly set encoding for text files to UTF-8
            # For binary files, encoding should be None
            file_encoding = "utf-8" if mode == "r" else None 

            # Pass the encoding to the open() function
            with open(filename, mode, encoding=file_encoding) as file: # THIS IS THE KEY CHANGE
                content = file.read()
                self.send_response(200)
                self.send_header("Content-type", content_type)
                self.end_headers()
                # For text content, ensure it's encoded to UTF-8 bytes for sending
                self.wfile.write(content if content_type.startswith("image/") else content.encode('utf-8'))
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 File Not Found")
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"500 Internal Server Error: {str(e)}".encode('utf-8'))

    def respond_with_message(self, message, status=200):
        """Send a text/html message to the client."""
        self.send_response(status)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(message.encode('utf-8'))

    def handle_avatar_upload(self, username, file_data):
        """Handle avatar upload and save to disk."""
        if not username:
            return None
            
        # Generate filename
        ext = os.path.splitext(file_data['filename'])[1] if 'filename' in file_data else '.png'
        filename = f"{username}_{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(AVATAR_DIR, filename)
        
        try:
            with open(filepath, 'wb') as f:
                f.write(file_data['file_content'])
            return filename
        except Exception as e:
            print(f"Error saving avatar: {e}")
            return None

    def get_user_avatar(self, username):
        """Get the avatar path for a user."""
        if not username:
            return None
            
        # Check for existing avatar
        for file in os.listdir(AVATAR_DIR):
            if file.startswith(username + "_"):
                return os.path.join(AVATAR_DIR, file)
        
        # Return default avatar if none exists
        default_index = hash(username) % len(DEFAULT_AVATARS)
        return DEFAULT_AVATARS[default_index]

    def parse_multipart_form_data(self):
        """Parse multipart form data without using cgi module."""
        content_type = self.headers['Content-Type']
        if not content_type.startswith('multipart/form-data'):
            return None
            
        # Parse the boundary from the content type
        boundary = content_type.split('boundary=')[1].encode('utf-8')
        
        # Read the raw POST data
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        # Split the data into parts using the boundary
        parts = post_data.split(b'--' + boundary)
        
        form_data = {}
        
        for part in parts:
            if not part.strip() or part.endswith(b'--\r\n'):
                continue
                
            # Parse headers and body
            headers, body = part.split(b'\r\n\r\n', 1)
            headers = headers.decode('utf-8').split('\r\n')
            
            # Parse headers into a dictionary
            header_dict = {}
            for header in headers:
                if ': ' in header:
                    key, value = header.split(': ', 1)
                    header_dict[key.lower()] = value
            
            # Check if this part is a file upload
            if 'content-disposition' in header_dict:
                disposition = header_dict['content-disposition']
                if 'filename=' in disposition:
                    # This is a file upload
                    filename = disposition.split('filename=')[1].strip('"')
                    form_data['avatar'] = {
                        'filename': filename,
                        'file_content': body[:-2]  # Remove trailing \r\n
                    }
                else:
                    # This is a regular form field
                    name = disposition.split('name=')[1].strip('"')
                    form_data[name] = body[:-2].decode('utf-8')  # Remove trailing \r\n and decode
            
        return form_data

    # --- Authentication Handlers ---
    def handle_login(self, username, password):
        """Process the login request."""
        if username in users and not users[username]["is_suspended"]:
            if users[username]["password_hash"] == hash_password(password):
                session_id = str(uuid.uuid4())
                RequestHandler.sessions[session_id] = username
                self.send_response(302)  # Redirect
                self.send_header("Set-Cookie", f"session_id={session_id}; Path=/; HttpOnly")
                self.send_header("Set-Cookie", f"username={username}; Path=/")  # For client-side display
                self.send_header("Set-Cookie", f"is_admin={'admin' if users[username]['is_admin'] else 'user'}; Path=/")  # For client-side display
                self.send_header("Location", "/")
                self.end_headers()
            else:
                self.respond_with_message("<h1>Invalid username or password.</h1>", status=401)
        elif username in users and users[username]["is_suspended"]:
            self.respond_with_message("<h1>Account suspended. Please contact administrator.</h1>", status=403)
        else:
            self.respond_with_message("<h1>Invalid username or password.</h1>", status=401)

    def handle_signup(self, fields):  # Modified to accept 'fields' dictionary
        """Process the signup request."""
        if not settings['ALLOW_SIGNUP']:  # Check if signup is allowed
            self.respond_with_message("<h1>New user registration is currently disabled by the administrator.</h1>", status=403)
            return

        username = fields.get("username", [""])[0]  #
        password = fields.get("password", [""])[0]  #
        email = fields.get("email", [""])[0]  #
        phone = fields.get("phone", [""])[0]  #

        if username in users:
            self.respond_with_message("<h1>Username already exists. Please choose a different one.</h1>", status=409)
            return

        if not username or not password:
            self.respond_with_message("<h1>Username and password cannot be empty.</h1>", status=400)
            return

        users[username] = {
            "password_hash": hash_password(password),
            "is_admin": False,
            "is_suspended": False,
            "email": email,  #
            "phone": phone  #
        }
        save_users()
        self.respond_with_message("<h1>Signup successful! You can now <a href=\"/login\">login</a>.</h1>", status=201)

    def handle_logout(self, session_id):
        """Process logout request."""
        if session_id in RequestHandler.sessions:
            del RequestHandler.sessions[session_id]
        self.send_response(302)  # Redirect
        self.send_header("Set-Cookie", "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; Path=/; HttpOnly")
        self.send_header("Set-Cookie", "username=; expires=Thu, 01 Jan 1970 00:00:00 UTC; Path=/;")
        self.send_header("Set-Cookie", "is_admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; Path=/;")
        self.send_header("Location", "/login")
        self.end_headers()

    # --- Admin Content Management Handlers ---
    def handle_add_movie(self, fields):
        """Handles adding a new movie."""
        global managed_movies 

        title = fields.get("title", [""])[0]
        overview = fields.get("overview", [""])[0]
        release_date = fields.get("release_date", [""])[0]
        poster_path = fields.get("poster_path", [""])[0]
        
        # genre_ids will come as a comma-separated string, convert to list
        genre_ids_str = fields.get("genre_ids", [""])[0]
        genre_ids = [g_id.strip() for g_id in genre_ids_str.split(',') if g_id.strip()]
        
        if not title:
            self.respond_with_message("Movie title is required.", status=400)
            return
        
        movie_id = str(uuid.uuid4()) # Generate unique ID
        new_movie = {
            "id": movie_id,
            "title": title,
            "overview": overview,
            "release_date": release_date,
            "genre_ids": genre_ids, # Changed to genre_ids to match the data structure
            "poster_path": poster_path,
            "is_featured": False # Default to not featured
        }
        managed_movies[movie_id] = new_movie # Store as dict with ID as key
        save_json_data(managed_movies, MOVIE_FILE)
        self.respond_with_message(f"Movie '{title}' added successfully.")

    def handle_edit_movie(self, fields):
        """Handles editing an existing movie."""
        global managed_movies
        movie_id = fields.get("id", [""])[0]
        if not movie_id or movie_id not in managed_movies:
            self.respond_with_message("Movie not found for editing.", status=404)
            return

        movie = managed_movies[movie_id]
        
        # Update fields if provided
        movie["title"] = fields.get("title", [movie["title"]])[0]
        movie["overview"] = fields.get("overview", [movie["overview"]])[0]
        movie["release_date"] = fields.get("release_date", [movie["release_date"]])[0]
        movie["poster_path"] = fields.get("poster_path", [movie["poster_path"]])[0]
        
        # Handle genre_ids (comma-separated string to list)
        genre_ids_str = fields.get("genre_ids", None)
        if genre_ids_str is not None:
            movie["genre_ids"] = [g_id.strip() for g_id in genre_ids_str[0].split(',') if g_id.strip()]

        # Handle is_featured checkbox (will be 'on' if checked, or missing if unchecked)
        movie["is_featured"] = "is_featured" in fields
        
        save_json_data(managed_movies, MOVIE_FILE)
        self.respond_with_message(f"Movie '{movie['title']}' updated successfully!")

    def handle_delete_movie(self, fields):
        """Handles deleting a movie."""
        global managed_movies
        movie_id = fields.get("id", [""])[0]
        if not movie_id or movie_id not in managed_movies:
            self.respond_with_message("Movie not found for deletion.", status=404)
            return
        
        movie_title = managed_movies[movie_id]["title"] # Get title before deleting
        del managed_movies[movie_id]
        save_json_data(managed_movies, MOVIE_FILE)
        self.respond_with_message(f"Movie '{movie_title}' deleted successfully!")

    def handle_add_genre(self, fields):
        """Handles adding a new genre."""
        global managed_genres
        genre_name = fields.get("name", [""])[0].strip()
        if not genre_name:
            self.respond_with_message("Genre name is required.", status=400)
            return
        
        # Check for duplicate genre names (case-insensitive)
        if any(g["name"].lower() == genre_name.lower() for g in managed_genres.values()):
            self.respond_with_message("Genre with this name already exists.", status=409)
            return

        genre_id = str(uuid.uuid4())
        managed_genres[genre_id] = {"id": genre_id, "name": genre_name}
        save_json_data(managed_genres, GENRE_FILE)
        self.respond_with_message(f"Genre '{genre_name}' added successfully.")

    def handle_edit_genre(self, fields):
        """Handles editing an existing genre."""
        global managed_genres
        genre_id = fields.get("id", [""])[0]
        new_name = fields.get("name", [""])[0].strip()

        if not genre_id or genre_id not in managed_genres:
            self.respond_with_message("Genre not found for editing.", status=404)
            return
        if not new_name:
            self.respond_with_message("New genre name is required.", status=400)
            return
        
        # Check for duplicate genre names (case-insensitive, excluding itself)
        if any(g["name"].lower() == new_name.lower() for g_id, g in managed_genres.items() if g_id != genre_id):
            self.respond_with_message("Genre with this name already exists.", status=409)
            return

        old_name = managed_genres[genre_id]["name"]
        managed_genres[genre_id]["name"] = new_name
        save_json_data(managed_genres, GENRE_FILE)
        self.respond_with_message(f"Genre '{old_name}' updated to '{new_name}' successfully!")

    def handle_delete_genre(self, fields):
        """Handles deleting a genre."""
        global managed_genres
        global managed_movies # Need to update movies that use this genre
        genre_id = fields.get("id", [""])[0]
        if not genre_id or genre_id not in managed_genres:
            self.respond_with_message("Genre not found for deletion.", status=404)
            return
        
        genre_name = managed_genres[genre_id]["name"] # Get name before deleting
        del managed_genres[genre_id]
        save_json_data(managed_genres, GENRE_FILE)

        # Also remove this genre from any movies that might have it
        for movie_id in managed_movies:
            if 'genre_ids' in managed_movies[movie_id] and genre_id in managed_movies[movie_id]['genre_ids']:
                managed_movies[movie_id]['genre_ids'].remove(genre_id)
        save_json_data(managed_movies, MOVIE_FILE)

        self.respond_with_message(f"Genre '{genre_name}' deleted successfully!")

    def generate_mock_data(self):
        """Generates mock analytics data based on existing user and movie data."""
        # Mock data for Users by Creation Month
        users_by_creation_month = {
            "January": 10, "February": 15, "March": 20, "April": 12, "May": 25,
            "June": 18, "July": 22, "August": 19, "September": 28, "October": 14,
            "November": 30, "December": 23
        }

        # Mock data for Movies by Genre (based on actual genres if available)
        movies_by_genre = {genre["name"]: 0 for genre in managed_genres.values()}
        if not movies_by_genre: # Fallback if no genres are loaded
            movies_by_genre = {"Action": 0, "Comedy": 0, "Drama": 0, "Science Fiction": 0}

        for movie in managed_movies.values():
            for genre_id in movie.get("genre_ids", []):
                genre_name = managed_genres.get(genre_id, {}).get("name")
                if genre_name:
                    movies_by_genre[genre_name] = movies_by_genre.get(genre_name, 0) + 1

        # Mock data for Top Movies by Feature (e.g., top 5 featured movies)
        top_movies_by_feature = []
        featured_movies = [m for m in managed_movies.values() if m.get("is_featured")]
        # Sort by title for consistent mock data if not enough truly featured movies
        featured_movies_sorted = sorted(featured_movies, key=lambda x: x["title"])[:5] 
        for movie in featured_movies_sorted:
            top_movies_by_feature.append({
                "title": movie["title"],
                "views": (len(movie["title"]) * 100) % 1000 + 500 # Mock views
            })

        # Mock data for Active vs Suspended Users
        active_users = sum(1 for user_data in users.values() if not user_data["is_suspended"])
        suspended_users = sum(1 for user_data in users.values() if user_data["is_suspended"])
        active_vs_suspended_users = {
            "active": active_users,
            "suspended": suspended_users
        }
        
        return {
            "users_by_creation_month": users_by_creation_month,
            "movies_by_genre": movies_by_genre,
            "top_movies_by_feature": top_movies_by_feature,
            "active_vs_suspended_users": active_vs_suspended_users
        }

    # --- HTTP Method Handlers ---
    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        is_admin = self.is_authenticated_admin()
        
        # Serve static files
        if path == "/" or path == "/index.html":  # Add root path handler
            self.respond_with_file("index.html", "text/html")
        elif path == "/login":
            self.respond_with_file("login.html", "text/html")
        elif path == "/signup":
            self.respond_with_file("signup.html", "text/html")
        elif path == "/admin":
            self.respond_with_file("admin.html", "text/html")
        elif path == "/profile":
           self.respond_with_file("profile.html", "text/html")
        elif path == "/movie.html":
            self.respond_with_file("movie.html", "text/html")
        elif path == "/person.html":
            self.respond_with_file("person.html", "text/html")
        elif path == "/browser":
            self.respond_with_file("browser.html", "text/html")
        elif path == "/watchlist.html": # ADD THIS NEW CONDITION
            self.respond_with_file("watchlist.html", "text/html")
        elif path.endswith(".css"):
            self.respond_with_file(path[1:], "text/css")
        elif path.endswith(".js"):
            self.respond_with_file(path[1:], "text/javascript")
        elif path.endswith((".png", ".jpg", ".jpeg", ".gif", ".ico")):
            # Determine content type based on extension
            if path.endswith(".png"):
                self.respond_with_file(path[1:], "image/png")
            elif path.endswith((".jpg", ".jpeg")):
                self.respond_with_file(path[1:], "image/jpeg")
            elif path.endswith(".gif"):
                self.respond_with_file(path[1:], "image/gif")
            elif path.endswith(".ico"):
                self.respond_with_file(path[1:], "image/x-icon")
        # --- API Endpoints ---
        elif path == "/api/movies":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(list(managed_movies.values())).encode('utf-8'))
        elif path == "/api/genres":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(list(managed_genres.values())).encode('utf-8'))
        elif path == "/api/settings":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(settings).encode('utf-8'))
        elif path == "/api/user/avatar":
            username = self.get_current_username()
            if not username:
                self.send_response(404)
                self.end_headers()
                return
                
            avatar_path = self.get_user_avatar(username)
            if not avatar_path:
                self.send_response(404)
                self.end_headers()
                return
                
            try:
                with open(avatar_path, 'rb') as f:
                    avatar_data = f.read()
                self.send_response(200)
                self.send_header("Content-type", "image/png")  # Adjust based on actual image type
                self.end_headers()
                self.wfile.write(avatar_data)
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
        
        # --- Admin API Endpoints (requiring authentication) ---
        elif path == "/admin/users":  #
            if is_admin:
                search_query = query_params.get("search", [""])[0].lower()  #
                role_filter = query_params.get("role", ["all"])[0].lower()  #
                suspension_filter = query_params.get("suspension", ["all"])[0].lower()  #

                filtered_users = []  #
                for username, data in users.items():  #
                    if search_query and search_query not in username.lower():  #
                        continue  #
                    if role_filter != 'all' and ((role_filter == 'admin' and not data['is_admin']) or \
                                                 (role_filter == 'user' and data['is_admin'])):  #
                        continue  #
                    if suspension_filter != 'all' and ((suspension_filter == 'suspended' and not data['is_suspended']) or \
                                                      (suspension_filter == 'active' and data['is_suspended'])):  #
                        continue
                        
                    filtered_users.append({
                        "username": username,
                        "email": data.get("email", ""),  #
                        "phone": data.get("phone", ""),  #
                        "is_admin": data["is_admin"],
                        "is_suspended": data["is_suspended"]
                    })
                    
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(filtered_users).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        elif path == "/admin/movies":
            if is_admin:
                # Return movies as a list of their dicts for easier consumption by frontend
                movies_list = list(managed_movies.values())
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(movies_list).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        elif path == "/admin/genres":
            if is_admin:
                genres_list = list(managed_genres.values())
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(genres_list).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        
        # --- New Analytics Endpoints ---
        elif path == "/admin/analytics/users_by_creation_month":
            if is_admin:
                analytics_data = self.generate_mock_data()
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(analytics_data["users_by_creation_month"]).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        elif path == "/admin/analytics/movies_by_genre":
            if is_admin:
                analytics_data = self.generate_mock_data()
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(analytics_data["movies_by_genre"]).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        elif path == "/admin/analytics/top_movies_by_feature":
            if is_admin:
                analytics_data = self.generate_mock_data()
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(analytics_data["top_movies_by_feature"]).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        elif path == "/admin/analytics/active_vs_suspended_users":
            if is_admin:
                analytics_data = self.generate_mock_data()
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(analytics_data["active_vs_suspended_users"]).encode('utf-8'))
            else:
                self.forbidden_admin_response()
        # --- End New Analytics Endpoints ---

        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        content_type = self.headers.get('Content-Type', '')
        
        if content_type.startswith('multipart/form-data'):
            # Handle file upload
            form_data = self.parse_multipart_form_data()
            if not form_data:
                self.send_response(400)
                self.end_headers()
                return
        else:
            # Handle regular form data
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            form_data = parse_qs(post_data.decode('utf-8'), keep_blank_values=True)

        session_id = self.parse_cookies().get("session_id")
        is_admin = self.is_authenticated_admin()

        if path == "/login":
            username = form_data.get("username", [""])[0]
            password = form_data.get("password", [""])[0]
            self.handle_login(username, password)
        elif path == "/signup":
            self.handle_signup(form_data)  # Pass the entire form_data to handle_signup
        elif path == "/logout":
            self.handle_logout(session_id)
        elif path == "/api/user/avatar/upload":
            if not self.get_current_username():
                self.send_response(403)
                self.end_headers()
                return
                
            if 'avatar' not in form_data:
                self.send_response(400)
                self.end_headers()
                return
                
            username = self.get_current_username()
            avatar_filename = self.handle_avatar_upload(username, form_data['avatar'])
            
            if avatar_filename:
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"avatar": avatar_filename}).encode('utf-8'))
            else:
                self.send_response(500)
                self.end_headers()
        
        # --- Admin Content Management POST Endpoints ---
        elif path == "/admin/movies/add":
            if is_admin:
                self.handle_add_movie(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/movies/edit":
            if is_admin:
                self.handle_edit_movie(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/movies/delete":
            if is_admin:
                self.handle_delete_movie(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/genres/add":
            if is_admin:
                self.handle_add_genre(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/genres/edit":
            if is_admin:
                self.handle_edit_genre(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/genres/delete":
            if is_admin:
                self.handle_delete_genre(form_data)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/users/toggle_admin":
            if is_admin:
                username_to_toggle = form_data.get("username", [""])[0]
                make_admin = form_data.get("make_admin", ["false"])[0].lower() == "true"
                
                if username_to_toggle in users:
                    users[username_to_toggle]["is_admin"] = make_admin
                    save_users()
                    self.respond_with_message(f"Admin status for {username_to_toggle} set to {make_admin}")
                else:
                    self.respond_with_message("User not found", status=404)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/users/toggle_suspension":
            if is_admin:
                username_to_toggle = form_data.get("username", [""])[0]
                if username_to_toggle in users:
                    users[username_to_toggle]["is_suspended"] = not users[username_to_toggle]["is_suspended"]
                    save_users()
                    self.respond_with_message(f"Suspension status for user '{username_to_toggle}' toggled successfully.")
                else:
                    self.respond_with_message("User not found.", status=404)
            else:
                self.forbidden_admin_response()
        elif path == "/admin/users/reset_password":
            if is_admin:
                username = form_data.get("username", [""])[0]
                new_password = form_data.get("new_password", [""])[0]
                if username in users:
                    if new_password:
                        users[username]["password_hash"] = hash_password(new_password)
                        save_users()
                        self.respond_with_message(f"Password for user '{username}' reset successfully.")
                    else:
                        self.respond_with_message("New password cannot be empty.", status=400)
                else:
                    self.respond_with_message("User not found.", status=404)
            else:
                self.forbidden_admin_response()

        # Application Settings Update
        elif path == "/admin/settings/update":
            if self.is_authenticated_admin():
                global settings
                try:
                    # Note: 'fields' is not directly available here in do_POST, use 'form_data'
                    settings['TMDB_API_KEY'] = form_data.get("TMDB_API_KEY", [settings.get('TMDB_API_KEY', '')])[0]
                    settings['ALLOW_SIGNUP'] = form_data.get("ALLOW_SIGNUP", ['false'])[0].lower() == 'true'
                    settings['SITE_ANNOUNCEMENT'] = form_data.get("SITE_ANNOUNCEMENT", [''])[0]
                    settings['ANNOUNCEMENT_ACTIVE'] = form_data.get("ANNOUNCEMENT_ACTIVE", ['false'])[0].lower() == 'true'

                    save_settings(settings)
                    self.respond_with_message("Application settings updated successfully.")
                except Exception as e:
                    self.respond_with_message(f"Error updating settings: {str(e)}", status=500)
            else:
                self.forbidden_admin_response()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

# --- Start Server ---
def run():
    server_address = ("", 8080)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"Starting server on http://localhost:{8080}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()