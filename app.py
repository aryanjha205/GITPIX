import os
import base64
import uuid
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# GitHub Configuration
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_image():
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
        url = f"https://api.github.com/repos/{GITHUB_USERNAME}/{GITHUB_REPO}/contents/{path}"
        data = {
            "message": f"Upload image: {filename}",
            "content": content,
            "branch": GITHUB_BRANCH
        }

        response = requests.put(url, headers=HEADERS, json=data)
        
        if response.status_code in [201, 200]:
            raw_url = f"https://raw.githubusercontent.com/{GITHUB_USERNAME}/{GITHUB_REPO}/{GITHUB_BRANCH}/{path}"
            return jsonify({
                "message": "Upload successful",
                "url": raw_url,
                "filename": filename
            })
        else:
            return jsonify({
                "error": "Failed to upload to GitHub",
                "details": response.json()
            }), response.status_code

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/gallery', methods=['GET'])
def get_gallery():
    try:
        url = f"https://api.github.com/repos/{GITHUB_USERNAME}/{GITHUB_REPO}/contents/uploads?ref={GITHUB_BRANCH}"
        response = requests.get(url, headers=HEADERS)
        
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
            return jsonify({"error": "Failed to fetch gallery"}), response.status_code
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
