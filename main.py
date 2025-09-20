from flask import Flask, jsonify, send_from_directory, render_template, request
import subprocess
import os

app = Flask(__name__)

VIDEO_DIR = "static/assets/videos"
HLS_DIR = os.path.join(VIDEO_DIR, "hls")

ffmpeg = "./static/assets/ffmpeg/ffmpeg.exe"

os.makedirs(HLS_DIR, exist_ok=True)


def list_videos():
    """Return a list of video names (from HLS directories)."""
    return [
        f for f in os.listdir(HLS_DIR)
        if os.path.isdir(os.path.join(HLS_DIR, f))
    ]


def mkv_to_hls(video_name):
    """
    Convert MKV to HLS and store in a folder named after the video.
    Deletes the MKV after conversion.
    """
    mkv_file = os.path.join(VIDEO_DIR, f"{video_name}.mkv")
    output_dir = os.path.join(HLS_DIR, video_name)
    os.makedirs(output_dir, exist_ok=True)

    playlist_path = os.path.join(output_dir, "index.m3u8")
    vtt_path = os.path.join(output_dir, "subtitles.vtt")

    if os.path.exists(playlist_path):
        return f"/hls/{video_name}/index.m3u8"

    if not os.path.exists(mkv_file):
        return None

    cmd_video = [
        ffmpeg, "-i", mkv_file, "-map", "0:v", "-map", "0:a", "-c:v", "copy",
        "-c:a", "copy", "-f", "hls", "-hls_time", "6", "-hls_playlist_type",
        "vod", playlist_path
    ]
    subprocess.run(cmd_video, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    cmd_subs = [
        ffmpeg, "-i", mkv_file, "-map", "0:s:0?", "-c:s", "webvtt", vtt_path
    ]
    subprocess.run(cmd_subs, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if os.path.exists(mkv_file):
        os.remove(mkv_file)

    return f"/hls/{video_name}/index.m3u8"


def convert_all_mkvs():
    """Convert all MKV files in VIDEO_DIR to HLS, then delete them."""
    for f in os.listdir(VIDEO_DIR):
        if f.endswith(".mkv"):
            name, _ = os.path.splitext(f)
            mkv_to_hls(name)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/videos")
def api_videos():
    return jsonify(list_videos()), 200


@app.route("/api/stream/<video_name>")
def api_stream(video_name):
    playlist = mkv_to_hls(video_name)
    if playlist is None:
        return jsonify({"error": "Video not found"}), 404
    return jsonify({"playlist": playlist}), 200


@app.route("/api/upload", methods=["POST"])
def upload_video():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if not file.filename.lower().endswith(".mkv"):
        return jsonify({"error": "Only MKV files allowed"}), 415

    save_path = os.path.join(VIDEO_DIR, file.filename)
    with open(save_path, "wb") as f:
        while chunk := file.stream.read(8192):
            f.write(chunk)

    name, _ = os.path.splitext(file.filename)
    playlist = mkv_to_hls(name)
    if not playlist:
        return jsonify({"error": "Failed to process uploaded video"}), 500

    return jsonify({
        "success": True,
        "filename": file.filename,
        "playlist": playlist
    }), 201


@app.route("/hls/<path:path>")
def hls_files(path):
    full_path = os.path.join(HLS_DIR, path)
    if not os.path.exists(full_path):
        return jsonify({"error": "HLS file not found"}), 404
    return send_from_directory(HLS_DIR, path), 200


@app.route("/api/delete", methods=["POST"])
def delete_videos():
    data = request.json
    videos = data.get("videos", [])

    if not videos:
        return jsonify({"error": "No videos selected"}), 400

    for video in videos:
        folder = os.path.join(HLS_DIR, video)
        if os.path.exists(folder):
            # Delete folder and all contents
            for root, dirs, files in os.walk(folder, topdown=False):
                for name in files:
                    os.remove(os.path.join(root, name))
                for name in dirs:
                    os.rmdir(os.path.join(root, name))
            os.rmdir(folder)

        mkv_file = os.path.join(VIDEO_DIR, f"{video}.mkv")
        if os.path.exists(mkv_file):
            os.remove(mkv_file)

    return jsonify({"success": True}), 200


if __name__ == "__main__":
    convert_all_mkvs()
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
