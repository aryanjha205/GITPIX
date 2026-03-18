import os
import base64
import uuid
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def get_github_config():
    token = os.getenv("GITHUB_TOKEN")
    username = os.getenv("GITHUB_USERNAME")
    repo_value = os.getenv("GITHUB_REPO")
    branch = os.getenv("GITHUB_BRANCH", "main")

    owner = username
    repo = repo_value

    # Support either:
    # GITHUB_USERNAME=owner + GITHUB_REPO=repo
    # or GITHUB_REPO=owner/repo
    if repo_value and "/" in repo_value:
        owner, repo = repo_value.split("/", 1)

    return {
        "token": token,
        "owner": owner,
        "repo": repo,
        "branch": branch,
    }

def check_config(config):
    missing = []
    if not config["token"]:
        missing.append("GITHUB_TOKEN")
    if not config["repo"]:
        missing.append("GITHUB_REPO")
    if not config["owner"]:
        missing.append("GITHUB_USERNAME (or use GITHUB_REPO=owner/repo)")
    return missing

def github_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "GitPixUploader",
        "X-GitHub-Api-Version": "2022-11-28",
    }

def extract_github_error(response):
    try:
        payload = response.json()
    except ValueError:
        return response.text or "Unknown GitHub API error"

    if isinstance(payload, dict):
        message = payload.get("message")
        errors = payload.get("errors")
        if errors:
            return f"{message} | details: {errors}"
        if message:
            return message

    return str(payload)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    config = get_github_config()
    missing = check_config(config)
    if missing:
        return jsonify({"error": f"Missing environment variables on server: {', '.join(missing)}"}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Generate a unique filename
        ext = file.filename.split('.')[-1]
        filename = f"{uuid.uuid4()}.{ext}"
        path = f"uploads/{filename}"

        # Read and encode image to base64
        content = base64.b64encode(file.read()).decode('utf-8')

        # Push to GitHub API
        url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/contents/{path}"
        data = {
            "message": f"Upload image: {filename}",
            "content": content,
            "branch": config["branch"]
        }

        response = requests.put(url, headers=github_headers(config["token"]), json=data, timeout=30)
        
        if response.status_code in [201, 200]:
            raw_url = f"https://raw.githubusercontent.com/{config['owner']}/{config['repo']}/{config['branch']}/{path}"
            return jsonify({
                "message": "Upload successful",
                "url": raw_url,
                "filename": filename
            })
        else:
            return jsonify({
                "error": "Failed to upload to GitHub",
                "details": extract_github_error(response)
            }), response.status_code

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/gallery', methods=['GET'])
def get_gallery():
    config = get_github_config()
    missing = check_config(config)
    if missing:
        return jsonify({"error": f"Missing environment variables: {', '.join(missing)}"}), 500

    try:
        url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/contents/uploads?ref={config['branch']}"
        response = requests.get(url, headers=github_headers(config["token"]), timeout=30)
        
        if response.status_code == 200:
            files = response.json()
            images = []
            for f in files:
                if f['type'] == 'file' and any(f['name'].endswith(ext) for ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']):
                    images.append({
                        "name": f['name'],
                        "url": f['download_url']
                    })
            return jsonify(images)
        elif response.status_code == 404:
            # Folder might not exist yet
            return jsonify([])
        else:
            return jsonify({
                "error": "Failed to fetch gallery",
                "details": extract_github_error(response)
            }), response.status_code
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
