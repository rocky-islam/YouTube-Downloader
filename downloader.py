import yt_dlp
import json

def get_video_info(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return info
        except Exception as e:
            print(f"Error fetching video info: {e}")
            return None

def main():
    url = input("Enter YouTube Video URL: ")
    print("Fetching video information... Please wait.")
    info = get_video_info(url)
    
    if not info:
        return

    print(f"\nTitle: {info.get('title')}")
    
    video_tracks = []
    audio_tracks = []

    # Separate video and audio formats
    for f in info.get('formats', []):
        format_id = f.get('format_id')
        ext = f.get('ext')
        
        # Audio only formats
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
            language = f.get('language') or 'default'
            abr = f.get('abr', 0) # Audio bitrate
            audio_tracks.append({
                'id': format_id,
                'ext': ext,
                'abr': abr,
                'language': language,
                'desc': f"{language} - {abr}kbps ({ext})"
            })
            
        # Video only formats (or video+audio, but typically we look for high quality video only to merge later)
        elif f.get('vcodec') != 'none':
            res = f.get('resolution') or f"{f.get('width', '?')}x{f.get('height', '?')}"
            fps = f.get('fps', '')
            video_tracks.append({
                'id': format_id,
                'ext': ext,
                'res': res,
                'fps': fps,
                'desc': f"{res} @ {fps}fps ({ext})"
            })

    print("\n--- Available Video Tracks ---")
    for idx, track in enumerate(video_tracks):
        print(f"[{idx}] ID: {track['id']} | {track['desc']}")

    print("\n--- Available Audio Tracks ---")
    for idx, track in enumerate(audio_tracks):
        print(f"[{idx}] ID: {track['id']} | Language: {track['language']} | Bitrate: {track['abr']}kbps | Ext: {track['ext']}")

    v_idx = int(input("\nSelect Video Track Number: "))
    a_idx = int(input("Select Audio Track Number: "))

    selected_video = video_tracks[v_idx]['id']
    selected_audio = audio_tracks[a_idx]['id']

    print(f"\nYou selected Video ID {selected_video} and Audio ID {selected_audio}.")
    print("Starting download and merge process...\n")

    # yt-dlp options for downloading and merging
    download_opts = {
        'format': f'{selected_video}+{selected_audio}',
        'merge_output_format': 'mp4', # Can be mkv
        'outtmpl': '%(title)s.%(ext)s',
    }

    with yt_dlp.YoutubeDL(download_opts) as ydl:
        ydl.download([url])
        
    print("\nDownload Complete!")

if __name__ == "__main__":
    main()
