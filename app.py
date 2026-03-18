import os
import base64
import uuid
import requests
from functools import wraps
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "gitpix-dev-secret-change-me")

APP_PIN = os.getenv("APP_PIN", "2022")
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

def require_pin(view_func):
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        if not session.get("pin_verified"):
            return jsonify({"error": "PIN required"}), 401
        return view_func(*args, **kwargs)
    return wrapped_view

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

def upload_file_to_github(file, config, folder="uploads"):
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ""
    if ext not in IMAGE_EXTENSIONS:
        return {"success": False, "error": f"Unsupported file type for {file.filename}"}

    filename = f"{uuid.uuid4()}.{ext}"
    path = f"{folder}/{filename}"
    content = base64.b64encode(file.read()).decode('utf-8')

    url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/contents/{path}"
    data = {
        "message": f"Upload image: {filename}",
        "content": content,
        "branch": config["branch"]
    }

    response = requests.put(url, headers=github_headers(config["token"]), json=data, timeout=30)
    if response.status_code not in [200, 201]:
        return {
            "success": False,
            "error": "Failed to upload to GitHub",
            "details": extract_github_error(response),
            "status_code": response.status_code
        }

    raw_url = f"https://raw.githubusercontent.com/{config['owner']}/{config['repo']}/{config['branch']}/{path}"
    return {
        "success": True,
        "filename": filename,
        "url": raw_url
    }

@app.route('/')
def index():
    return render_template('index.html', app_unlocked=bool(session.get("pin_verified")))

@app.route('/unlock', methods=['POST'])
def unlock_app():
    payload = request.get_json(silent=True) or {}
    entered_pin = str(payload.get("pin", "")).strip()

    if entered_pin == APP_PIN:
        session["pin_verified"] = True
        return jsonify({"message": "Unlocked"})

    return jsonify({"error": "Incorrect PIN"}), 401

@app.route('/logout', methods=['POST'])
@require_pin
def logout():
    session.clear()
    return jsonify({"message": "Locked"})

@app.route('/upload', methods=['POST'])
@require_pin
def upload_image():
    config = get_github_config()
    missing = check_config(config)
    if missing:
        return jsonify({"error": f"Missing environment variables on server: {', '.join(missing)}"}), 500

    folder = request.form.get('folder', 'uploads').strip()
    folder = "/".join([p for p in folder.split('/') if p and p != '..'])
    if not folder:
        folder = "uploads"

    files = request.files.getlist('images')
    if not files:
        single_file = request.files.get('image')
        if single_file:
            files = [single_file]

    files = [file for file in files if file and file.filename]
    if not files:
        return jsonify({"error": "No image provided"}), 400

    try:
        uploaded = []
        failed = []

        for file in files:
            result = upload_file_to_github(file, config, folder=folder)
            if result["success"]:
                uploaded.append({
                    "filename": result["filename"],
                    "url": result["url"]
                })
            else:
                failed.append({
                    "filename": file.filename,
                    "error": result.get("error", "Upload failed"),
                    "details": result.get("details")
                })

        if not uploaded:
            status_code = 400
            if failed and failed[0].get("details"):
                status_code = 502 if "GitHub" in failed[0]["error"] else 400
            return jsonify({
                "error": "Failed to upload images",
                "details": failed
            }), status_code

        return jsonify({
            "message": f"Uploaded {len(uploaded)} image(s)",
            "uploaded": uploaded,
            "failed": failed
        }), 207 if failed else 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/gallery', methods=['GET'])
@require_pin
def get_gallery():
    config = get_github_config()
    missing = check_config(config)
    if missing:
        return jsonify({"error": f"Missing environment variables: {', '.join(missing)}"}), 500

    try:
        url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/git/trees/{config['branch']}?recursive=1"
        response = requests.get(url, headers=github_headers(config["token"]), timeout=30)
        
        if response.status_code == 200:
            tree = response.json().get('tree', [])
            images = []
            for item in tree:
                if item['type'] == 'blob' and any(item['path'].lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                    raw_url = f"https://raw.githubusercontent.com/{config['owner']}/{config['repo']}/{config['branch']}/{item['path']}"
                    folder_path = '/'.join(item['path'].split('/')[:-1])
                    images.append({
                        "name": item['path'].split('/')[-1],
                        "path": item['path'],
                        "folder": folder_path if folder_path else 'root',
                        "url": raw_url
                    })
            images.sort(key=lambda x: x['path'])
            return jsonify(images)
        elif response.status_code == 404:
            return jsonify([])
        else:
            return jsonify({
                "error": "Failed to fetch gallery",
                "details": extract_github_error(response)
            }), response.status_code
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/delete', methods=['POST'])
@require_pin
def delete_image():
    payload = request.get_json(silent=True) or {}
    path = payload.get("path")
    if not path:
        return jsonify({"error": "No path provided"}), 400

    config = get_github_config()
    
    url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/contents/{path}?ref={config['branch']}"
    res = requests.get(url, headers=github_headers(config["token"]))
    if res.status_code != 200:
        return jsonify({"error": "File not found"}), 404
        
    sha = res.json().get('sha')
    
    delete_url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/contents/{path}"
    data = {
        "message": f"Delete image: {path}",
        "sha": sha,
        "branch": config["branch"]
    }
    
    del_res = requests.delete(delete_url, headers=github_headers(config["token"]), json=data)
    if del_res.status_code in [200, 201]:
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to delete", "details": extract_github_error(del_res)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
