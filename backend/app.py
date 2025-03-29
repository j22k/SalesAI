import os
import uuid
import json
# import torch # Assuming not used directly in this simplified version
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import speech_recognition as sr
# from gtts import gTTS # Not used here
from pydub import AudioSegment
# import subprocess # No longer needed for direct conversion call
# import ffmpeg # Potentially not needed directly, pydub handles interaction

# --- Configure pydub FFmpeg path (Optional but Recommended for Robustness) ---
# Even for WAV, pydub might use ffprobe for info. Explicitly setting paths
# prevents reliance on the system PATH, which caused issues before.
# *MAKE SURE THIS PATH IS CORRECT FOR YOUR SYSTEM*
FFMPEG_BIN_PATH = r"C:\ffmpeg\bin" # Use raw string (r"...") or double backslashes

FFMPEG_PATH = os.path.join(FFMPEG_BIN_PATH, "ffmpeg.exe")
FFPROBE_PATH = os.path.join(FFMPEG_BIN_PATH, "ffprobe.exe")

if os.path.exists(FFMPEG_PATH):
    print(f"INFO: Configuring pydub with ffmpeg: {FFMPEG_PATH}")
    AudioSegment.converter = FFMPEG_PATH
else:
    print(f"WARNING: ffmpeg.exe not found at specified path: {FFMPEG_PATH}. pydub may rely on system PATH.")

if os.path.exists(FFPROBE_PATH):
     print(f"INFO: Configuring pydub with ffprobe: {FFPROBE_PATH}")
     AudioSegment.ffprobe = FFPROBE_PATH
else:
     print(f"WARNING: ffprobe.exe not found at specified path: {FFPROBE_PATH}. pydub analysis might be limited.")
# --- End pydub Configuration ---


# Ensure upload and audio directories exist
UPLOAD_FOLDER = 'uploads'
GENERATED_AUDIO_FOLDER = 'generated_audio' # Keep if you plan to use gTTS later
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(GENERATED_AUDIO_FOLDER, exist_ok=True)

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

def generate_viseme_data(audio_path):
    """Generate basic viseme data for lip-sync from a WAV file."""
    visemes = []
    try:
        print(f"Generating visemes for WAV: {audio_path}")
        # pydub should handle WAV files easily
        audio = AudioSegment.from_file(audio_path, format="wav") # Explicitly state format
        duration = len(audio) / 1000.0  # duration in seconds

        if duration <= 0:
             print("Warning: Audio duration is zero or negative.")
             return {'mouthCues': []}

        num_cues = min(int(duration * 5), 30)  # generate around 5 cues/sec, max 30
        print(f"Audio duration: {duration:.2f}s, Generating {num_cues} viseme cues.")

        if num_cues == 0:
             return {'mouthCues': []}

        # Simple placeholder viseme generation logic - REPLACE FOR REAL LIPSYNC
        viseme_values = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']
        for i in range(num_cues):
            start = i * (duration / num_cues)
            end = (i + 1) * (duration / num_cues)
            viseme = viseme_values[i % len(viseme_values)]
            visemes.append({
                'start': round(start, 3),
                'end': round(end, 3),
                'value': viseme
            })

        print(f"Generated {len(visemes)} visemes.")
        return {'mouthCues': visemes}

    except FileNotFoundError:
         print(f"Error: Audio file not found at {audio_path} for viseme generation.")
         raise # Re-raise
    except Exception as e:
        # Log pydub specific errors if they occur
        print(f"Error generating viseme data with pydub: {e}")
        # Optionally, try to get more details if it's an FFmpeg issue triggered by pydub
        if "ffmpeg" in str(e).lower() or "ffprobe" in str(e).lower():
             print("This might be related to FFmpeg/ffprobe availability or configuration.")
        # Return empty data or raise an error
        return {'mouthCues': []}


# Function to transcribe audio (handles WAV directly)
def transcribe_audio(wav_audio_path):
    """Transcribes audio from a WAV file using SpeechRecognition."""
    recognizer = sr.Recognizer()
    if not os.path.exists(wav_audio_path):
         print(f"Error: WAV file not found for transcription at {wav_audio_path}")
         return "Transcription failed: Input audio file not found."
    try:
        with sr.AudioFile(wav_audio_path) as source:
            print(f"Reading WAV audio data from: {wav_audio_path}")
            audio_data = recognizer.record(source)  # Read the entire audio file

        print("Sending audio data to Google Web Speech API for transcription...")
        text = recognizer.recognize_google(audio_data)
        print(f"Transcription successful: '{text}'")
        return text
    except sr.UnknownValueError:
        print("Speech Recognition could not understand audio")
        return "" # Return empty string if audio is unintelligible
    except sr.RequestError as e:
        print(f"Could not request results from Google Web Speech API; {e}")
        return f"Transcription failed: API request error ({e}). Check internet connection."
    except Exception as e:
        print(f"An unexpected error occurred during transcription: {e}")
        # Specific check for audio format issues that SR might raise
        if "wav" in str(e).lower() or "format" in str(e).lower():
             print("This might indicate an issue with the WAV file format or encoding.")
        return f"Transcription failed: Unexpected error ({e})."


# --- Route to process the uploaded WAV audio ---
@app.route('/api/process-speech', methods=['POST'])
def process_speech():
    print("\n--- New Request ---")
    # Log headers if needed for debugging CORS or Content-Type issues
    print("Full Request Headers:")
    for header, value in request.headers:
        print(f"{header}: {value}")

    print("Request Content Type:", request.content_type)
    # print("All Request Form Data:", request.form) # Usually empty for file uploads
    print("All Request Files:", request.files)

    # 1. Check for the audio file
    if 'audio' not in request.files:
        print("ERROR: 'audio' field missing in request files.")
        return jsonify({'error': 'No audio file part', 'details': "Request must contain a file part named 'audio'."}), 400

    audio_file = request.files['audio']
    original_filename = audio_file.filename
    print(f"Received file: {original_filename} (Content-Type: {audio_file.content_type})") # Log content type from upload

    # 2. Validate filename
    if not original_filename:
        print("ERROR: No selected file (empty filename).")
        return jsonify({'error': 'No selected file', 'details': 'Uploaded file has an empty filename.'}), 400

    # Ensure the file *looks* like a WAV file (basic check)
    if not original_filename.lower().endswith('.wav'):
         print(f"WARNING: Received file '{original_filename}' does not end with .wav. Processing anyway.")
         # You might choose to reject non-WAV files here if you want to be strict:
         # return jsonify({'error': 'Invalid file format', 'details': 'Expected a .wav file.'}), 400

    # 3. Generate unique filename and save
    unique_id = uuid.uuid4()
    # Use .wav extension regardless of original, as we expect WAV
    saved_filename = f"{unique_id}.wav"
    input_filepath = os.path.join(UPLOAD_FOLDER, saved_filename)
    cleanup_input = False # Flag for finally block

    try:
        audio_file.save(input_filepath)
        cleanup_input = True
        print(f"WAV file saved successfully: {input_filepath}")
        file_size = os.path.getsize(input_filepath)
        print(f"File size: {file_size} bytes")

        # Basic check for empty file
        if file_size == 0:
             print("ERROR: Saved file is empty.")
             raise ValueError("Uploaded audio file is empty.")

        # --- WebM Conversion Step REMOVED ---
        # Frontend is expected to send WAV directly.

        # 4. Transcribe the saved WAV audio
        print(f"Starting transcription for: {input_filepath}")
        transcription = transcribe_audio(input_filepath)
        print(f"Transcription result: '{transcription}'") # Log result here too

        # Check if transcription failed (returned error message or empty string)
        if not transcription or "failed" in transcription.lower():
             print("Transcription did not produce usable text.")
             # Decide how to handle this - maybe return empty visemes?
             viseme_data = {'mouthCues': []}
        else:
             # 5. Generate viseme data from the WAV audio
             print(f"Starting viseme generation for: {input_filepath}")
             viseme_data = generate_viseme_data(input_filepath)

        print(f"Viseme data generated: {json.dumps(viseme_data, indent=2)}") # Log generated data
        # 6. Return success response
        print("Processing complete. Sending response.")
        return jsonify({
            'status': 'WAV file received and processed',
            'original_filename': original_filename, # Still useful to return
            'size': file_size,
            'transcript': transcription,
            'viseme_data': viseme_data
        }), 200

    except ValueError as ve: # Catch specific errors like empty file
         print(f"ERROR: Value error during processing - {ve}")
         return jsonify({'error': 'File processing error', 'details': str(ve)}), 400
    except FileNotFoundError as fnf:
        # This might happen if transcribe_audio or generate_viseme_data can't find the file
        print(f"ERROR: File not found during processing step - {fnf}")
        return jsonify({'error': 'File processing error', 'details': f"Could not find intermediate file: {fnf}"}), 500
    except Exception as e:
        print(f"ERROR: An unexpected error occurred during processing - {e}")
        import traceback
        traceback.print_exc() # Log full trace for debugging unknown errors
        return jsonify({
            'error': 'An unexpected error occurred during processing',
            'details': str(e)
        }), 500

    finally:
        # 7. Cleanup temporary WAV file
        if cleanup_input and os.path.exists(input_filepath):
            try:
                os.remove(input_filepath)
                print(f"Cleaned up temporary WAV file: {input_filepath}")
            except OSError as e:
                print(f"Warning: Could not remove temporary file {input_filepath}: {e}")
        print("--- Request End ---")


# Route to serve generated audio (e.g., from gTTS if added later)
@app.route('/generated_audio/<filename>')
def serve_audio(filename):
    """Serves files from the generated_audio directory."""
    print(f"Serving file: {filename} from {GENERATED_AUDIO_FOLDER}")
    # Add security check for filename if needed
    # from werkzeug.utils import secure_filename
    # safe_filename = secure_filename(filename)
    return send_from_directory(GENERATED_AUDIO_FOLDER, filename)


if __name__ == '__main__':
    # Set debug=False for production environments
    app.run(host='0.0.0.0', port=5000, debug=True)